// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title IdentityRegistry
/// @notice An ERC-8004 ("Trustless Agents") Identity Registry for QDay Aevum, which has no
/// canonical deployment. Each identity is an ERC-721 token: agentId = tokenId, agentURI =
/// tokenURI (a registration file naming the business). Its payment address is the reserved
/// `agentWallet`, which starts as the owner and can only move to a wallet that signs for it.
/// Sluice reads it for Confirmation of Payee: does the address on a bill belong to the
/// business the bill names?
/// One addition outside the standard, `agentOfWallet`, answers that question in one call.
contract IdentityRegistry is ERC721URIStorage, EIP712 {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);

    error NotAuthorized();
    error ReservedKey();
    error Expired();
    error BadSignature();
    error WalletTaken();

    bytes32 private constant WALLET_KEY = keccak256("agentWallet");
    bytes32 public constant SET_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 nonce,uint256 deadline)");

    uint256 public agentCount;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => address) private _wallet;
    /// @notice Reverse lookup: the identity a payment wallet belongs to (0 if none).
    mapping(address => uint256) public agentOfWallet;
    mapping(uint256 => uint256) public walletNonce;

    constructor() ERC721("ERC-8004 Agent Identity", "AGENT") EIP712("ERC8004IdentityRegistry", "1") {}

    // ------------------------------------------------------------ register
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _register(agentURI);
        for (uint256 i; i < metadata.length; i++) _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
    }

    function register(string calldata agentURI) external returns (uint256) {
        return _register(agentURI);
    }

    function register() external returns (uint256) {
        return _register("");
    }

    function _register(string memory agentURI) private returns (uint256 agentId) {
        agentId = ++agentCount;
        _safeMint(msg.sender, agentId);
        if (bytes(agentURI).length != 0) _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
        _bindWallet(agentId, msg.sender);
    }

    // ------------------------------------------------------ uri, metadata
    modifier onlyAgentOwner(uint256 agentId) {
        if (!_isAuthorized(_ownerOf(agentId), msg.sender, agentId)) revert NotAuthorized();
        _;
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAgentOwner(agentId) {
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        if (keccak256(bytes(metadataKey)) == WALLET_KEY) return abi.encode(_wallet[agentId]);
        return _metadata[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external onlyAgentOwner(agentId) {
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function _setMetadata(uint256 agentId, string calldata key, bytes calldata value) private {
        if (keccak256(bytes(key)) == WALLET_KEY) revert ReservedKey();
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    // ------------------------------------------------------------- wallet
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _wallet[agentId];
    }

    /// @notice Move the payment wallet. `newWallet` proves control with an EIP-712 signature
    /// (an EOA) or ERC-1271 (a contract wallet) over this agent, a nonce and a deadline.
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature)
        external
        onlyAgentOwner(agentId)
    {
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(SET_WALLET_TYPEHASH, agentId, newWallet, walletNonce[agentId]++, deadline))
        );
        if (!SignatureChecker.isValidSignatureNow(newWallet, digest, signature)) revert BadSignature();
        _bindWallet(agentId, newWallet);
    }

    function unsetAgentWallet(uint256 agentId) external onlyAgentOwner(agentId) {
        _bindWallet(agentId, address(0));
    }

    /// One wallet answers for one identity, so a reverse lookup can never be ambiguous.
    function _bindWallet(uint256 agentId, address w) private {
        if (w != address(0) && agentOfWallet[w] != 0 && agentOfWallet[w] != agentId) revert WalletTaken();
        address old = _wallet[agentId];
        if (old != address(0) && agentOfWallet[old] == agentId) delete agentOfWallet[old];
        _wallet[agentId] = w;
        if (w != address(0)) agentOfWallet[w] = agentId;
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(w));
    }

    /// The spec: a transferred identity loses its wallet until the new owner verifies one.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != from && _wallet[tokenId] != address(0)) _bindWallet(tokenId, address(0));
    }
}
