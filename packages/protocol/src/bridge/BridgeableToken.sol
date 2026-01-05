// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BridgeableToken
 * @notice ERC20 token that can be minted and burned by the bridge contract
 * @dev The bridge contract is the owner and can mint/burn tokens
 */
contract BridgeableToken is ERC20, ERC20Burnable, Ownable {
    uint8 private _decimals;

    /**
     * @notice Constructor for BridgeableToken
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals_ Token decimals
     * @param bridge Address of the bridge contract (will be the owner)
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        address bridge
    ) ERC20(name, symbol) Ownable(bridge) {
        _decimals = decimals_;
    }

    /**
     * @notice Returns the number of decimals for the token
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint tokens to an address (only callable by owner/bridge)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from an address (only callable by owner/bridge)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) external onlyOwner {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }

    /**
     * @notice Burn tokens from the bridge itself (for escrowed tokens)
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external onlyOwner {
        _burn(msg.sender, amount);
    }
}

