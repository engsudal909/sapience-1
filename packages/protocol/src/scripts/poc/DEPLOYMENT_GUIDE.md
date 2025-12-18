# Guía de Deployment - OAppFactory (Método Simple)

Esta guía explica cómo desplegar el `OAppFactory` en ambas testnets (Arbitrum Sepolia y Base Sepolia) usando el mismo deployer y nonce.

## Prerrequisitos

1. **Tener test ETH en ambas redes**:
   - Arbitrum Sepolia: https://faucet.quicknode.com/arbitrum/sepolia
   - Base Sepolia: https://www.coinbase.com/developer-platform/products/faucet

2. **Variables de entorno configuradas**:
   ```bash
   export DEPLOYER_ADDRESS=0xTuDireccion
   export DEPLOYER_PRIVATE_KEY=0xTuClavePrivada
   ```

## Paso 1: Verificar Nonces Actuales

Antes de desplegar, necesitas verificar el nonce de tu dirección en ambas redes:

### Arbitrum Sepolia
1. Ve a: https://sepolia-explorer.arbitrum.io
2. Busca tu dirección (`DEPLOYER_ADDRESS`)
3. Anota el **Transaction Count** (este es tu nonce)

### Base Sepolia
1. Ve a: https://sepolia-explorer.base.org
2. Busca tu dirección (`DEPLOYER_ADDRESS`)
3. Anota el **Transaction Count** (este es tu nonce)

## Paso 2: Igualar Nonces (si son diferentes)

Si los nonces son diferentes, necesitas igualarlos antes de desplegar:

### Opción A: Enviar transacciones dummy
En la red con el nonce más bajo, envía transacciones hasta igualar el nonce de la otra red.

**Ejemplo**: Si Arbitrum Sepolia tiene nonce 5 y Base Sepolia tiene nonce 3:
- Envía 2 transacciones dummy en Base Sepolia para llegar a nonce 5

### Opción B: Desplegar primero en la red con nonce más bajo
Si prefieres no enviar transacciones dummy, despliega primero en la red con el nonce más bajo, luego en la otra.

**⚠️ IMPORTANTE**: Con esta opción, las direcciones NO serán iguales. Solo funciona si despliegas en ambas redes con el mismo nonce.

## Paso 3: Deployment

Una vez que los nonces sean iguales (o hayas decidido usar la Opción B), procede con el deployment:

### 3.1 Deploy en Arbitrum Sepolia

```bash
# Configurar RPC URL
export ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc

# Deploy
forge script src/scripts/poc/DeployOAppFactory.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv
```

**Anota la dirección del factory desplegado** (se mostrará en los logs).

### 3.2 Verificar Nonce Después del Deployment

Después del deployment en Arbitrum Sepolia, tu nonce habrá aumentado en 1.

**Ejemplo**: Si tu nonce era 5 antes del deployment, ahora será 6.

### 3.3 Igualar Nonce en Base Sepolia

Si el nonce en Base Sepolia no coincide con el nuevo nonce de Arbitrum Sepolia:

1. Calcula la diferencia: `nonce_arbitrum - nonce_base`
2. Envía esa cantidad de transacciones dummy en Base Sepolia

**Ejemplo**: Si Arbitrum Sepolia tiene nonce 6 y Base Sepolia tiene nonce 3:
- Envía 3 transacciones dummy en Base Sepolia para llegar a nonce 6

### 3.4 Deploy en Base Sepolia

```bash
# Configurar RPC URL
export BASE_SEPOLIA_RPC=https://sepolia.base.org

# Deploy (con el mismo nonce que usaste en Arbitrum Sepolia)
forge script src/scripts/poc/DeployOAppFactory.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv
```

### 3.5 Verificar que las Direcciones Coinciden

Compara las direcciones del factory en ambas redes. Deben ser **idénticas**.

Si no coinciden:
- Verifica que usaste el mismo nonce en ambas redes
- Verifica que usaste la misma dirección de deployer
- Verifica que el bytecode es el mismo (mismo contrato, mismo constructor)

## Paso 4: Configurar DVN (Opcional pero Recomendado)

Una vez desplegado el factory en ambas redes, configura los DVN settings:

```solidity
// En Arbitrum Sepolia
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.ARBITRUM,
    sendLibAddress,      // Obtener de LayerZero docs
    receiveLibAddress,   // Obtener de LayerZero docs
    requiredDVNAddress,  // Obtener de LayerZero docs
    executorAddress      // Obtener de LayerZero docs
);

// En Base Sepolia
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.BASE,
    sendLibAddress,
    receiveLibAddress,
    requiredDVNAddress,
    executorAddress
);
```

## Troubleshooting

### Error: "DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY mismatch"
- Verifica que `DEPLOYER_ADDRESS` corresponde a la dirección derivada de `DEPLOYER_PRIVATE_KEY`
- Puedes verificar con: `cast wallet address --private-key $DEPLOYER_PRIVATE_KEY`

### Error: Direcciones no coinciden
- Verifica que el nonce era el mismo en ambas redes antes del deployment
- Verifica que usaste la misma dirección de deployer
- Verifica que no hubo transacciones intermedias que cambiaron el nonce

### Error: "Insufficient funds"
- Asegúrate de tener suficiente test ETH en ambas redes
- Los deployments requieren gas, verifica tus balances

## Ejemplo Completo

```bash
# 1. Configurar variables
export DEPLOYER_ADDRESS=0x1234...
export DEPLOYER_PRIVATE_KEY=0xabcd...
export ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
export BASE_SEPOLIA_RPC=https://sepolia.base.org

# 2. Verificar nonces (manual - usar exploradores)

# 3. Si nonces diferentes, igualarlos (enviar transacciones dummy)

# 4. Deploy en Arbitrum Sepolia
forge script src/scripts/poc/DeployOAppFactory.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv

# 5. Anotar dirección y nuevo nonce

# 6. Igualar nonce en Base Sepolia (si es necesario)

# 7. Deploy en Base Sepolia
forge script src/scripts/poc/DeployOAppFactory.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv

# 8. Verificar que las direcciones coinciden
```

## Notas Importantes

1. **El nonce debe ser EXACTAMENTE el mismo** en ambas redes antes de cada deployment
2. **Cualquier transacción** en una red cambiará el nonce y hará que las direcciones no coincidan
3. **Para producción**, considera usar un DDP (Deterministic Deployment Proxy) que es más confiable
4. **Este método funciona bien para testnets** donde puedes controlar fácilmente los nonces

## Siguiente Paso

Una vez que tengas el factory desplegado en ambas redes con la misma dirección:
1. Configura los DVN settings
2. Crea pairs usando el mismo salt en ambas redes
3. Configura LayerZero en los pairs
4. Prueba la comunicación cross-chain

