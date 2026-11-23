// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SluiceVault
/// @notice Company-owned stablecoin vault that lets an AI agent pay invoices
///         through a metered gate. The owner holds the funds; agents hold
///         scoped, expiring session keys that can only pay allowlisted
///         payees within per-payment and 24-hour budgets. Payments above the
///         approval threshold are queued for the owner instead of executed.
/// @dev    Amounts are in the token's smallest unit. tUSD8 has 6 decimals,
///         so 1 tUSD8 == 1_000_000.
contract SluiceVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WINDOW = 24 hours;

    struct Session {
        uint128 perPaymentCap; // max single payment
        uint128 dailyCap; // max total per 24h window
        uint64 expiresAt; // unix seconds; session dead after this
        uint64 windowStart; // start of current 24h window
        uint128 spentInWindow; // spent since windowStart
        bool active;
    }

    enum InvoiceStatus {
        None,
        Paid,
        Pending,
        Rejected
    }

    struct Invoice {
        InvoiceStatus status;
        address payee;
        uint128 amount;
        address agent;
        bytes32 memoHash;
    }

    IERC20 public immutable token;

    /// @notice Balance that must always remain in the vault after a payment.
    uint256 public cashBuffer;
    /// @notice Agent payments strictly above this amount are queued for approval.
    uint256 public approvalThreshold;

    mapping(address agent => Session) public sessions;
    mapping(address payee => bool) public isAllowedPayee;
    mapping(address payee => bool) public isBlockedPayee;
    /// @notice Idempotency: an invoice id can only ever be settled once.
    mapping(bytes32 invoiceId => Invoice) public invoices;

    // ---------------------------------------------------------------- events

    event SessionGranted(address indexed agent, uint256 perPaymentCap, uint256 dailyCap, uint64 expiresAt);
    event SessionRevoked(address indexed agent);
    event PayeeAllowed(address indexed payee, bool allowed);
    event PayeeBlocked(address indexed payee, bool blocked);
    event CashBufferSet(uint256 amount);
    event ApprovalThresholdSet(uint256 amount);
    /// @notice Receipt for every settled payment.
    event InvoicePaid(
        bytes32 indexed invoiceId,
        address indexed payee,
        uint256 amount,
        address indexed agent,
        bytes32 memoHash,
        bool ownerApproved
    );
    event PaymentQueued(bytes32 indexed invoiceId, address indexed payee, uint256 amount, address indexed agent, bytes32 memoHash);
    event PaymentRejected(bytes32 indexed invoiceId);
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors

    error NotActiveAgent();
    error SessionExpired();
    error PayeeNotAllowed(address payee);
    error PayeeIsBlocked(address payee);
    error ZeroAmount();
    error ZeroAddress();
    error InvoiceAlreadyUsed(bytes32 invoiceId);
    error InvoiceNotPending(bytes32 invoiceId);
    error ExceedsPerPaymentCap(uint256 amount, uint256 cap);
    error ExceedsDailyCap(uint256 requested, uint256 remaining);
    error BreachesCashBuffer(uint256 balanceAfter, uint256 buffer);
    error InvalidSession();

    constructor(address owner_, IERC20 token_, uint256 cashBuffer_, uint256 approvalThreshold_) Ownable(owner_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
        cashBuffer = cashBuffer_;
        approvalThreshold = approvalThreshold_;
        emit CashBufferSet(cashBuffer_);
        emit ApprovalThresholdSet(approvalThreshold_);
    }

    // ------------------------------------------------------------ owner admin

    function grantSession(address agent, uint128 perPaymentCap, uint128 dailyCap, uint64 expiresAt) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (perPaymentCap == 0 || dailyCap < perPaymentCap || expiresAt <= block.timestamp) revert InvalidSession();
        sessions[agent] = Session({
            perPaymentCap: perPaymentCap,
            dailyCap: dailyCap,
            expiresAt: expiresAt,
            windowStart: uint64(block.timestamp),
            spentInWindow: 0,
            active: true
        });
        emit SessionGranted(agent, perPaymentCap, dailyCap, expiresAt);
    }

    /// @notice Instantly kill an agent's ability to pay.
    function revokeSession(address agent) external onlyOwner {
        sessions[agent].active = false;
        emit SessionRevoked(agent);
    }

    function setPayeeAllowed(address payee, bool allowed) external onlyOwner {
        if (payee == address(0)) revert ZeroAddress();
        isAllowedPayee[payee] = allowed;
        emit PayeeAllowed(payee, allowed);
    }

    /// @notice A blocked payee cannot be paid even if allowlisted, including by owner approval.
    function setPayeeBlocked(address payee, bool blocked) external onlyOwner {
        isBlockedPayee[payee] = blocked;
        emit PayeeBlocked(payee, blocked);
    }

    function setCashBuffer(uint256 amount) external onlyOwner {
        cashBuffer = amount;
        emit CashBufferSet(amount);
    }

    function setApprovalThreshold(uint256 amount) external onlyOwner {
        approvalThreshold = amount;
        emit ApprovalThresholdSet(amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner can always pull funds out, buffer or not, paused or not.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // ------------------------------------------------------------ agent flow

    /// @notice Agent pays an invoice. Executes immediately if within limits and
    ///         at or below the approval threshold; otherwise queues it.
    /// @return executed true if paid now, false if queued for owner approval.
    function pay(bytes32 invoiceId, address payee, uint128 amount, bytes32 memoHash)
        external
        whenNotPaused
        nonReentrant
        returns (bool executed)
    {
        Session storage s = sessions[msg.sender];
        if (!s.active) revert NotActiveAgent();
        if (block.timestamp >= s.expiresAt) revert SessionExpired();
        if (amount == 0) revert ZeroAmount();
        if (invoices[invoiceId].status != InvoiceStatus.None) revert InvoiceAlreadyUsed(invoiceId);
        _checkPayee(payee);
        if (amount > s.perPaymentCap) revert ExceedsPerPaymentCap(amount, s.perPaymentCap);

        if (amount > approvalThreshold) {
            invoices[invoiceId] = Invoice(InvoiceStatus.Pending, payee, amount, msg.sender, memoHash);
            emit PaymentQueued(invoiceId, payee, amount, msg.sender, memoHash);
            return false;
        }

        _consumeBudget(s, amount);
        invoices[invoiceId] = Invoice(InvoiceStatus.Paid, payee, amount, msg.sender, memoHash);
        _transferRespectingBuffer(payee, amount);
        emit InvoicePaid(invoiceId, payee, amount, msg.sender, memoHash, false);
        return true;
    }

    /// @notice Owner approves a queued payment. Payee rules and the cash
    ///         buffer still apply; the agent's budget is not charged.
    function approve(bytes32 invoiceId) external onlyOwner whenNotPaused nonReentrant {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Pending) revert InvoiceNotPending(invoiceId);
        _checkPayee(inv.payee);
        inv.status = InvoiceStatus.Paid;
        _transferRespectingBuffer(inv.payee, inv.amount);
        emit InvoicePaid(invoiceId, inv.payee, inv.amount, inv.agent, inv.memoHash, true);
    }

    function reject(bytes32 invoiceId) external onlyOwner {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Pending) revert InvoiceNotPending(invoiceId);
        inv.status = InvoiceStatus.Rejected;
        emit PaymentRejected(invoiceId);
    }

    // ------------------------------------------------------------------ views

    /// @notice How much the agent can still spend in its current window.
    function remainingDailyBudget(address agent) external view returns (uint256) {
        Session memory s = sessions[agent];
        if (!s.active || block.timestamp >= s.expiresAt) return 0;
        if (block.timestamp >= uint256(s.windowStart) + WINDOW) return s.dailyCap;
        return s.dailyCap - s.spentInWindow;
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    // --------------------------------------------------------------- internal

    function _checkPayee(address payee) internal view {
        if (isBlockedPayee[payee]) revert PayeeIsBlocked(payee);
        if (!isAllowedPayee[payee]) revert PayeeNotAllowed(payee);
    }

    function _consumeBudget(Session storage s, uint128 amount) internal {
        if (block.timestamp >= uint256(s.windowStart) + WINDOW) {
            s.windowStart = uint64(block.timestamp);
            s.spentInWindow = 0;
        }
        uint128 remaining = s.dailyCap - s.spentInWindow;
        if (amount > remaining) revert ExceedsDailyCap(amount, remaining);
        s.spentInWindow += amount;
    }

    function _transferRespectingBuffer(address payee, uint256 amount) internal {
        uint256 bal = token.balanceOf(address(this));
        uint256 after_ = amount > bal ? 0 : bal - amount;
        if (amount > bal || after_ < cashBuffer) revert BreachesCashBuffer(after_, cashBuffer);
        token.safeTransfer(payee, amount);
    }
}
