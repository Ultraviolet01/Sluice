// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SluiceVault} from "./SluiceVault.sol";

/// @title SluiceFactory
/// @notice Lets anyone create their company's SluiceVault in one signature from
///         the app. The caller becomes the vault's owner; the factory keeps no
///         rights over the vaults it creates and cannot change them afterwards.
contract SluiceFactory {
    IERC20 public immutable token;
    uint256 public constant MAX_NAME = 48;
    uint256 public constant MAX_PER_OWNER = 20;

    address[] private _all;
    mapping(address owner => address[]) private _byCreator;
    mapping(address vault => string) public nameOf;
    mapping(address vault => bool) public isVault;

    event VaultCreated(address indexed creator, address indexed vault, string name);

    error InvalidName();
    error TooManyVaults();

    constructor(IERC20 token_) {
        token = token_;
    }

    /// @notice Creates a vault owned by the caller, holding `token`.
    function createVault(string calldata name, uint256 cashBuffer, uint256 approvalThreshold) external returns (address vault) {
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_NAME) revert InvalidName();
        if (_byCreator[msg.sender].length >= MAX_PER_OWNER) revert TooManyVaults();
        vault = address(new SluiceVault(msg.sender, token, cashBuffer, approvalThreshold));
        _all.push(vault);
        _byCreator[msg.sender].push(vault);
        nameOf[vault] = name;
        isVault[vault] = true;
        emit VaultCreated(msg.sender, vault, name);
    }

    /// @notice Vaults this address created. Ownership can later move (two-step); the vault's owner() is the truth.
    function vaultsCreatedBy(address creator) external view returns (address[] memory) {
        return _byCreator[creator];
    }

    function vaultCount() external view returns (uint256) {
        return _all.length;
    }

    function vaultAt(uint256 i) external view returns (address) {
        return _all[i];
    }
}
