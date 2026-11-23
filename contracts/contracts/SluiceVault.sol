// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SluiceVault
/// @notice A company-owned tUSD8 vault on QDay Aevum. The owner lists bills
///         (payee, amount, schedule). An AI agent holding a scoped, expiring
///         session key can only settle those bills: by bill id and period, to
///         the bill's own payee, for the bill's exact amount. Anything outside
///         the owner's caps becomes a proposal the owner approves or rejects.
///         A stolen agent key can therefore only pay the owner's own bills,
///         each period at most once, inside the caps.
/// @dev    Amounts are in the token's smallest unit. tUSD8 has 6 decimals.
contract SluiceVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------ constants

    uint256 public constant WINDOW = 24 hours;
    /// @notice How early before its due time a bill period may be settled.
    uint256 public constant EARLY = 3 days;
    /// @notice Agent payments remembered for the rolling 24h cap.
    uint256 public constant SLOTS = 32;
    uint256 public constant MAX_LABEL = 64;
    uint256 public constant MAX_BATCH = 50;
    uint256 public constant MAX_NOTE = 280;

    // ---------------------------------------------------------------- types

    struct Session {
        uint128 perPaymentCap;
        uint128 dailyCap; // rolling 24 hours
        uint64 expiresAt;
        bool active;
    }

    struct Spend {
        uint64 at;
        uint128 amount;
    }

    struct Bill {
        address payee;
        uint128 amount;
        uint64 firstDue; // unix seconds
        uint32 intervalDays; // 0 = one-off; otherwise repeats every N days
        bool active;
        bool critical; // the agent pays it first and never holds it back for the buffer
        string label;
    }

    /// @notice One bill in an `addBills` batch.
    struct BillInput {
        address payee;
        uint128 amount;
        uint64 firstDue;
        uint32 intervalDays;
        bool critical;
        string label;
    }

    enum Band {
        RunsAlone,
        NeedsApproval,
        Blocked
    }

    enum Reason {
        Ok,
        // Blocked: the agent may neither pay nor propose.
        Paused,
        NoSession,
        SessionExpired,
        NoSuchBill,
        BillCancelled,
        BadPeriod,
        NotDueYet,
        AlreadySettled,
        AlreadyProposed,
        Blocklisted,
        // NeedsApproval: the agent may propose; the owner decides.
        NotAllowlisted,
        OverPerPaymentCap,
        OverDailyCap,
        OverApprovalThreshold,
        BelowCashBuffer
    }

    enum Status {
        None,
        Pending,
        Paid,
        Rejected
    }

    struct Proposal {
        Status status;
        address agent;
        uint64 createdAt;
        Reason reason;
        string note;
    }

    // ---------------------------------------------------------------- state

    IERC20 public immutable token;

    uint256 public cashBuffer;
    uint256 public approvalThreshold;

    mapping(address agent => Session) public sessions;
    /// @notice The vault's one current agent. Granting a session to another
    ///         address revokes this one, so a rotated key stops working at once.
    address public agent;
    /// @notice Optional second key the owner trusts to make the vault stricter, never
    ///         looser: pause, block a payee, reject a proposal. Used by the Telegram bot,
    ///         so a founder can stop a scam from their phone in one tap. It can never
    ///         unpause, unblock, approve, allow a payee, change a limit or move money.
    address public guardian;
    /// @notice Where the agent sends this vault's alerts (a Telegram chat id), set by the owner.
    string public notifyChat;
    mapping(address agent => Spend[SLOTS]) private _spends;
    mapping(address agent => uint256) private _spendHead;

    mapping(address payee => bool) public isAllowedPayee;
    mapping(address payee => bool) public isBlockedPayee;

    Bill[] private _bills;
    /// @notice Settlement record per bill period: the vault pays each at most once.
    mapping(uint256 billId => mapping(uint32 period => Proposal)) public settlements;

    // --------------------------------------------------------------- events

    event SessionGranted(address indexed agent, uint256 perPaymentCap, uint256 dailyCap, uint64 expiresAt, string reason);
    event SessionRevoked(address indexed agent, string reason);
    event PayeeAllowed(address indexed payee, bool allowed, string reason);
    event PayeeBlocked(address indexed payee, bool blocked, string reason);
    /// @notice Every rule change is logged with its old value, new value and the owner's reason.
    event PolicyChanged(bytes32 indexed field, uint256 oldValue, uint256 newValue, string reason);
    event BillAdded(uint256 indexed billId, address indexed payee, uint256 amount, uint64 firstDue, uint32 intervalDays, bool critical, string label);
    event BillCancelled(uint256 indexed billId, string reason);
    event BillReleased(uint256 indexed billId, uint32 indexed period);
    /// @notice Receipt for every settled bill period.
    event BillPaid(
        uint256 indexed billId,
        uint32 indexed period,
        address indexed payee,
        uint256 amount,
        address agent,
        bool ownerApproved
    );
    event PaymentProposed(uint256 indexed billId, uint32 indexed period, address indexed agent, uint256 amount, Reason reason, string note);
    event PaymentRejected(uint256 indexed billId, uint32 indexed period);
    event Withdrawn(address indexed to, uint256 amount);
    event GuardianSet(address indexed guardian, string reason);
    event NotifyChatSet(string chat);

    // --------------------------------------------------------------- errors

    error Refused(Reason reason);
    error NotAgentPayable(Reason reason);
    error NotPending();
    error NotOwnerOrGuardian();
    error ZeroAddress();
    error InvalidSession();
    error InvalidBill();
    error TooLong();
    error TooManyRecentPayments();
    error InsufficientFunds(uint256 balance, uint256 amount);

    constructor(address owner_, IERC20 token_, uint256 cashBuffer_, uint256 approvalThreshold_) Ownable(owner_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
        cashBuffer = cashBuffer_;
        approvalThreshold = approvalThreshold_;
        emit PolicyChanged("cashBuffer", 0, cashBuffer_, "vault created");
        emit PolicyChanged("approvalThreshold", 0, approvalThreshold_, "vault created");
    }

    // ================================================================ owner

    function grantSession(address newAgent, uint128 perPaymentCap, uint128 dailyCap, uint64 expiresAt, string calldata reason)
        external
        onlyOwner
    {
        _checkReason(reason);
        if (newAgent == address(0)) revert ZeroAddress();
        if (perPaymentCap == 0 || dailyCap < perPaymentCap || expiresAt <= block.timestamp) revert InvalidSession();
        address old = agent;
        if (old != address(0) && old != newAgent && sessions[old].active) {
            sessions[old].active = false;
            emit SessionRevoked(old, reason);
        }
        agent = newAgent;
        sessions[newAgent] = Session(perPaymentCap, dailyCap, expiresAt, true);
        emit SessionGranted(newAgent, perPaymentCap, dailyCap, expiresAt, reason);
    }

    /// @notice Instantly removes an agent's ability to pay or propose.
    function revokeSession(address who, string calldata reason) external onlyOwner {
        _checkReason(reason);
        sessions[who].active = false;
        if (who == agent) agent = address(0);
        emit SessionRevoked(who, reason);
    }

    function setPayeeAllowed(address payee, bool allowed, string calldata reason) external onlyOwner {
        _checkReason(reason);
        _setAllowed(payee, allowed, reason);
    }

    /// @notice A blocked payee is never paid, not even by owner approval.
    function setPayeeBlocked(address payee, bool blocked, string calldata reason) external onlyOwner {
        _checkReason(reason);
        _setBlocked(payee, blocked, reason);
    }

    /// @notice Approves (or removes) up to MAX_BATCH payees in one signature.
    function setPayeesAllowed(address[] calldata payees, bool allowed, string calldata reason) external onlyOwner {
        _checkReason(reason);
        if (payees.length == 0 || payees.length > MAX_BATCH) revert InvalidBill();
        for (uint256 i; i < payees.length; ++i) _setAllowed(payees[i], allowed, reason);
    }

    /// @notice Blocks (or unblocks) up to MAX_BATCH addresses in one signature.
    function setPayeesBlocked(address[] calldata payees, bool blocked, string calldata reason) external onlyOwner {
        _checkReason(reason);
        if (payees.length == 0 || payees.length > MAX_BATCH) revert InvalidBill();
        for (uint256 i; i < payees.length; ++i) _setBlocked(payees[i], blocked, reason);
    }

    function _setAllowed(address payee, bool allowed, string calldata reason) internal {
        if (payee == address(0)) revert ZeroAddress();
        isAllowedPayee[payee] = allowed;
        emit PayeeAllowed(payee, allowed, reason);
    }

    function _setBlocked(address payee, bool blocked, string calldata reason) internal {
        if (payee == address(0)) revert ZeroAddress();
        isBlockedPayee[payee] = blocked;
        emit PayeeBlocked(payee, blocked, reason);
    }

    function setCashBuffer(uint256 amount, string calldata reason) external onlyOwner {
        _checkReason(reason);
        emit PolicyChanged("cashBuffer", cashBuffer, amount, reason);
        cashBuffer = amount;
    }

    function setApprovalThreshold(uint256 amount, string calldata reason) external onlyOwner {
        _checkReason(reason);
        emit PolicyChanged("approvalThreshold", approvalThreshold, amount, reason);
        approvalThreshold = amount;
    }

    /// @notice Lists a bill the agent may settle. intervalDays = 0 for a one-off bill.
    function addBill(address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool critical, string calldata label)
        external
        onlyOwner
        returns (uint256 billId)
    {
        return _addBill(payee, amount, firstDue, intervalDays, critical, label);
    }

    /// @notice Lists up to MAX_BATCH bills in one signature (a bulk import).
    function addBills(BillInput[] calldata bills) external onlyOwner returns (uint256 firstId) {
        if (bills.length == 0 || bills.length > MAX_BATCH) revert InvalidBill();
        firstId = _bills.length;
        for (uint256 i; i < bills.length; ++i) {
            BillInput calldata b = bills[i];
            _addBill(b.payee, b.amount, b.firstDue, b.intervalDays, b.critical, b.label);
        }
    }

    function _addBill(address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool critical, string calldata label)
        internal
        returns (uint256 billId)
    {
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0 || firstDue == 0) revert InvalidBill();
        if (bytes(label).length > MAX_LABEL) revert TooLong();
        billId = _bills.length;
        _bills.push(Bill(payee, amount, firstDue, intervalDays, true, critical, label));
        emit BillAdded(billId, payee, amount, firstDue, intervalDays, critical, label);
    }

    function cancelBill(uint256 billId, string calldata reason) external onlyOwner {
        _checkReason(reason);
        if (billId >= _bills.length) revert InvalidBill();
        _bills[billId].active = false;
        emit BillCancelled(billId, reason);
    }

    /// @notice Lets a rejected bill period be proposed again.
    function releaseBill(uint256 billId, uint32 period) external onlyOwner {
        Proposal storage p = settlements[billId][period];
        if (p.status != Status.Rejected) revert NotPending();
        delete settlements[billId][period];
        emit BillReleased(billId, period);
    }

    /// @notice Pays a proposed bill period. Payee rules still apply; the cash
    ///         buffer does not (the owner chose to pay), the agent budget is not charged.
    function approve(uint256 billId, uint32 period) external onlyOwner whenNotPaused nonReentrant {
        Proposal storage p = settlements[billId][period];
        if (p.status != Status.Pending) revert NotPending();
        Bill storage b = _bills[billId];
        if (!b.active) revert Refused(Reason.BillCancelled);
        if (isBlockedPayee[b.payee]) revert Refused(Reason.Blocklisted);
        p.status = Status.Paid;
        _transfer(b.payee, b.amount);
        emit BillPaid(billId, period, b.payee, b.amount, p.agent, true);
    }

    function reject(uint256 billId, uint32 period) external onlyOwnerOrGuardian {
        Proposal storage p = settlements[billId][period];
        if (p.status != Status.Pending) revert NotPending();
        p.status = Status.Rejected;
        emit PaymentRejected(billId, period);
    }

    function pause() external onlyOwnerOrGuardian {
        _pause();
    }

    /// @notice Lets a guardian (or no one, with address(0)) make the vault stricter. See `guardian`.
    function setGuardian(address newGuardian, string calldata reason) external onlyOwner {
        _checkReason(reason);
        guardian = newGuardian;
        emit GuardianSet(newGuardian, reason);
    }

    /// @notice A guardian may block a payee, never unblock one: blocking only ever stops payments.
    function guardianBlock(address payee, string calldata reason) external onlyOwnerOrGuardian {
        _checkReason(reason);
        _setBlocked(payee, true, reason);
    }

    /// @notice The chat the agent sends this vault's alerts to; empty to stop them.
    function setNotifyChat(string calldata chat) external onlyOwner {
        if (bytes(chat).length > 64) revert TooLong();
        notifyChat = chat;
        emit NotifyChatSet(chat);
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice The owner can always pull funds out, paused or not, buffer or not.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // ================================================================ agent

    /// @notice Settles a listed bill period inside the caps. Reverts with the
    ///         reason when the bill must instead be proposed or is refused.
    function pay(uint256 billId, uint32 period) external nonReentrant {
        (Band band, Reason reason) = checkPayment(msg.sender, billId, period);
        if (band != Band.RunsAlone) revert NotAgentPayable(reason);
        Bill storage b = _bills[billId];
        _recordSpend(msg.sender, b.amount);
        settlements[billId][period] = Proposal(Status.Paid, msg.sender, uint64(block.timestamp), Reason.Ok, "");
        _transfer(b.payee, b.amount);
        emit BillPaid(billId, period, b.payee, b.amount, msg.sender, false);
    }

    /// @notice Files a bill period for the owner. The agent may propose any bill it
    ///         could pay (choosing caution, e.g. after a failed review) or that is
    ///         outside its limits; refused ones (blocklist, unlisted, paid) cannot.
    function propose(uint256 billId, uint32 period, string calldata note) external {
        if (bytes(note).length > MAX_NOTE) revert TooLong();
        (Band band, Reason reason) = checkPayment(msg.sender, billId, period);
        if (band == Band.Blocked) revert Refused(reason);
        settlements[billId][period] = Proposal(Status.Pending, msg.sender, uint64(block.timestamp), reason, note);
        emit PaymentProposed(billId, period, msg.sender, _bills[billId].amount, reason, note);
    }

    // ================================================================ views

    /// @notice What would happen if `agent` settled this bill period now.
    function checkPayment(address who, uint256 billId, uint32 period) public view returns (Band, Reason) {
        if (paused()) return (Band.Blocked, Reason.Paused);
        Session memory s = sessions[who];
        if (!s.active) return (Band.Blocked, Reason.NoSession);
        if (block.timestamp >= s.expiresAt) return (Band.Blocked, Reason.SessionExpired);
        if (billId >= _bills.length) return (Band.Blocked, Reason.NoSuchBill);
        Bill memory b = _bills[billId];
        if (!b.active) return (Band.Blocked, Reason.BillCancelled);
        if (b.intervalDays == 0 && period != 0) return (Band.Blocked, Reason.BadPeriod);
        if (block.timestamp + EARLY < dueAt(billId, period)) return (Band.Blocked, Reason.NotDueYet);
        Status st = settlements[billId][period].status;
        if (st == Status.Paid || st == Status.Rejected) return (Band.Blocked, Reason.AlreadySettled);
        if (st == Status.Pending) return (Band.Blocked, Reason.AlreadyProposed);
        if (isBlockedPayee[b.payee]) return (Band.Blocked, Reason.Blocklisted);

        if (!isAllowedPayee[b.payee]) return (Band.NeedsApproval, Reason.NotAllowlisted);
        if (b.amount > s.perPaymentCap) return (Band.NeedsApproval, Reason.OverPerPaymentCap);
        if (b.amount > approvalThreshold) return (Band.NeedsApproval, Reason.OverApprovalThreshold);
        if (spentInWindow(who) + b.amount > s.dailyCap) return (Band.NeedsApproval, Reason.OverDailyCap);
        uint256 bal = token.balanceOf(address(this));
        if (b.amount > bal || bal - b.amount < cashBuffer) return (Band.NeedsApproval, Reason.BelowCashBuffer);
        return (Band.RunsAlone, Reason.Ok);
    }

    function dueAt(uint256 billId, uint32 period) public view returns (uint256) {
        Bill storage b = _bills[billId];
        return uint256(b.firstDue) + uint256(period) * uint256(b.intervalDays) * 1 days;
    }

    /// @notice Sum of the agent's own payments in the last 24 hours.
    function spentInWindow(address who) public view returns (uint256 total) {
        Spend[SLOTS] storage ring = _spends[who];
        for (uint256 i; i < SLOTS; ++i) {
            if (ring[i].at != 0 && block.timestamp < uint256(ring[i].at) + WINDOW) total += ring[i].amount;
        }
    }

    function remainingDailyBudget(address who) external view returns (uint256) {
        Session memory s = sessions[who];
        if (!s.active || block.timestamp >= s.expiresAt) return 0;
        uint256 spent = spentInWindow(who);
        return spent >= s.dailyCap ? 0 : s.dailyCap - spent;
    }

    function billCount() external view returns (uint256) {
        return _bills.length;
    }

    function getBill(uint256 billId) external view returns (Bill memory) {
        return _bills[billId];
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    // ============================================================= internal

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner() && (msg.sender != guardian || guardian == address(0))) revert NotOwnerOrGuardian();
        _;
    }

    function _checkReason(string calldata reason) internal pure {
        if (bytes(reason).length > MAX_NOTE) revert TooLong();
    }

    function _recordSpend(address who, uint128 amount) internal {
        uint256 head = _spendHead[who];
        Spend storage slot = _spends[who][head];
        // The oldest slot must have left the window, or the ring cannot hold this payment.
        if (slot.at != 0 && block.timestamp < uint256(slot.at) + WINDOW) revert TooManyRecentPayments();
        slot.at = uint64(block.timestamp);
        slot.amount = amount;
        _spendHead[who] = (head + 1) % SLOTS;
    }

    function _transfer(address to, uint256 amount) internal {
        uint256 bal = token.balanceOf(address(this));
        if (amount > bal) revert InsufficientFunds(bal, amount);
        token.safeTransfer(to, amount);
    }
}
