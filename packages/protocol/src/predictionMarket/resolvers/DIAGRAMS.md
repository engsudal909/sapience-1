# Prediction Market LayerZero Resolver Diagrams

This document contains interaction diagrams for both the complex and simplified versions of the LayerZero-based PredictionMarket Resolvers.

## Complex Version Architecture

### System Overview
```mermaid
graph TB
    subgraph "Prediction Market Network"
        PM[Prediction Market Contract]
        PMR[PredictionMarketLayerZeroResolver]
        LZ1[LayerZero Endpoint]
    end
    
    subgraph "UMA Network"
        UMA[UMA Optimistic Oracle V3]
        UMR[PredictionMarketUmaLayerZeroResolver]
        LZ2[LayerZero Endpoint]
    end
    
    PM -->|submitAssertion| PMR
    PMR -->|LayerZero Message| LZ1
    LZ1 -.->|Cross-chain| LZ2
    LZ2 -->|LayerZero Message| UMR
    UMR -->|assertTruth| UMA
    UMA -->|callback| UMR
    UMR -->|LayerZero Message| LZ2
    LZ2 -.->|Cross-chain| LZ1
    LZ1 -->|LayerZero Message| PMR
    PMR -->|update state| PM
```

### Complex Version Flow
```mermaid
sequenceDiagram
    participant User
    participant PM as Prediction Market
    participant PMR as Prediction Market Resolver
    participant LZ1 as LayerZero (PM Side)
    participant LZ2 as LayerZero (UMA Side)
    participant UMR as UMA Resolver
    participant UMA as UMA Optimistic Oracle V3
    
    User->>PM: Submit Prediction
    PM->>PMR: submitAssertion(claim, endTime, resolvedToYes)
    
    Note over PMR: Validate & Check Bond
    PMR->>PMR: Check approved asserters
    PMR->>PMR: Validate market not ended
    PMR->>PMR: Transfer bond tokens
    
    PMR->>LZ1: CMD_TO_UMA_SUBMIT_ASSERTION
    LZ1-->>LZ2: Cross-chain message
    LZ2->>UMR: _lzReceive()
    
    UMR->>UMA: assertTruth(claim, asserter, ...)
    UMA-->>UMR: assertionResolvedCallback()
    
    UMR->>LZ2: CMD_FROM_UMA_ASSERTION_RESOLVED
    LZ2-->>LZ1: Cross-chain message
    LZ1->>PMR: _lzReceive()
    
    PMR->>PMR: assertionResolvedCallback()
    PMR->>PM: Update market state
```

## Simplified Version Architecture

### System Overview
```mermaid
graph TB
    subgraph "Prediction Market Network"
        PM[Prediction Market Contract]
        PMR[PredictionMarketSimpleResolver]
        LZ1[LayerZero Endpoint]
    end
    
    subgraph "UMA Network"
        UMA[UMA Optimistic Oracle V3]
        UMR[PredictionMarketUmaSimpleResolver]
        LZ2[LayerZero Endpoint]
        Bonds[Bond Management]
    end
    
    User[User/Asserter] -->|submitAssertion| UMR
    UMR -->|manage bonds| Bonds
    UMR -->|assertTruth| UMA
    UMA -->|callback| UMR
    UMR -->|LayerZero Message| LZ2
    LZ2 -.->|Cross-chain| LZ1
    LZ1 -->|LayerZero Message| PMR
    PMR -->|update state| PM
    PM -->|check resolution| PMR
```

### Simplified Version Flow
```mermaid
sequenceDiagram
    participant User
    participant UMR as UMA Resolver
    participant Bonds as Bond Management
    participant UMA as UMA Optimistic Oracle V3
    participant LZ2 as LayerZero (UMA Side)
    participant LZ1 as LayerZero (PM Side)
    participant PMR as Prediction Market Resolver
    participant PM as Prediction Market
    
    User->>UMR: depositBond(currency, amount)
    UMR->>Bonds: Store bond tokens
    
    User->>UMR: submitAssertion(claim, endTime, resolvedToYes)
    
    Note over UMR: Validate & Use Bonds
    UMR->>UMR: Check bond balance
    UMR->>UMR: Deduct bond amount
    UMR->>UMA: assertTruth(claim, asserter, ...)
    
    UMA-->>UMR: assertionResolvedCallback()
    UMR->>LZ2: CMD_FROM_UMA_MARKET_RESOLVED
    LZ2-->>LZ1: Cross-chain message
    LZ1->>PMR: _lzReceive()
    
    PMR->>PMR: marketResolvedCallback()
    PMR->>PM: Update market state
    
    PM->>PMR: getPredictionResolution()
    PMR-->>PM: Return resolution status
```

## Message Flow Comparison

### Complex Version Messages
```mermaid
graph LR
    subgraph "Prediction Market → UMA"
        A[CMD_TO_UMA_SUBMIT_ASSERTION]
    end
    
    subgraph "UMA → Prediction Market"
        B[CMD_FROM_UMA_ASSERTION_RESOLVED]
        C[CMD_FROM_UMA_ASSERTION_DISPUTED]
    end
    
    A --> B
    A --> C
```

### Simplified Version Messages
```mermaid
graph LR
    subgraph "UMA → Prediction Market"
        A[CMD_FROM_UMA_MARKET_RESOLVED]
        B[CMD_FROM_UMA_MARKET_DISPUTED]
    end
    
    Note1[No messages from PM to UMA]
    Note2[All submission handled on UMA side]
```

## State Management Comparison

### Complex Version State
```mermaid
stateDiagram-v2
    [*] --> MarketCreated: submitAssertion()
    MarketCreated --> AssertionSubmitted: LayerZero message sent
    AssertionSubmitted --> UMAProcessing: UMA receives assertion
    UMAProcessing --> Resolved: UMA resolves
    UMAProcessing --> Disputed: UMA disputes
    Resolved --> [*]
    Disputed --> MarketCreated: Can resubmit
```

### Simplified Version State
```mermaid
stateDiagram-v2
    [*] --> UMASubmission: submitAssertion() on UMA side
    UMASubmission --> UMAProcessing: UMA receives assertion
    UMAProcessing --> Resolved: UMA resolves
    UMAProcessing --> Disputed: UMA disputes
    Resolved --> [*]
    Disputed --> UMASubmission: Can resubmit
```

## Bond Management Comparison

### Complex Version Bond Flow
```mermaid
graph TD
    User[User] -->|Transfer Bond| PMR[Prediction Market Resolver]
    PMR -->|Check Balance| PMR
    PMR -->|Transfer to UMA| UMR[UMA Resolver]
    UMR -->|Approve & Submit| UMA[UMA Optimistic Oracle V3]
    UMA -->|Return Bond| UMR
    UMR -->|Return Bond| PMR
    PMR -->|Return Bond| User
```

### Simplified Version Bond Flow
```mermaid
graph TD
    User[User] -->|Deposit Bond| UMR[UMA Resolver]
    UMR -->|Store Bond| Bonds[Bond Management]
    UMR -->|Use Bond| UMA[UMA Optimistic Oracle V3]
    UMA -->|Return Bond| UMR
    UMR -->|Store Bond| Bonds
    User -->|Withdraw Bond| UMR
    UMR -->|Return Bond| User
```

## Deployment Architecture

### Complex Version Deployment
```mermaid
graph TB
    subgraph "Prediction Market Network"
        PM[Prediction Market]
        PMR[PredictionMarketLayerZeroResolver]
        LZ1[LayerZero Endpoint]
        Bonds1[Bond Management]
    end
    
    subgraph "UMA Network"
        UMA[UMA Optimistic Oracle V3]
        UMR[PredictionMarketUmaLayerZeroResolver]
        LZ2[LayerZero Endpoint]
    end
    
    PMR --> Bonds1
    PMR --> LZ1
    UMR --> LZ2
    LZ1 -.-> LZ2
```

### Simplified Version Deployment
```mermaid
graph TB
    subgraph "Prediction Market Network"
        PM[Prediction Market]
        PMR[PredictionMarketSimpleResolver]
        LZ1[LayerZero Endpoint]
    end
    
    subgraph "UMA Network"
        UMA[UMA Optimistic Oracle V3]
        UMR[PredictionMarketUmaSimpleResolver]
        LZ2[LayerZero Endpoint]
        Bonds[Bond Management]
    end
    
    PMR --> LZ1
    UMR --> Bonds
    UMR --> LZ2
    LZ1 -.-> LZ2
```

## Error Handling Flows

### Complex Version Error Handling
```mermaid
graph TD
    A[Submit Assertion] --> B{Valid Asserter?}
    B -->|No| C[OnlyApprovedAssertersCanCall]
    B -->|Yes| D{Market Ended?}
    D -->|No| E[MarketNotEnded]
    D -->|Yes| F{Enough Bond?}
    F -->|No| G[NotEnoughBondAmount]
    F -->|Yes| H[Submit to UMA]
    H --> I{UMA Success?}
    I -->|No| J[UMA Error]
    I -->|Yes| K[Success]
```

### Simplified Version Error Handling
```mermaid
graph TD
    A[Submit Assertion] --> B{Market Ended?}
    B -->|No| C[MarketNotEnded]
    B -->|Yes| D{Enough Bond?}
    D -->|No| E[NotEnoughBondAmount]
    D -->|Yes| F[Submit to UMA]
    F --> G{UMA Success?}
    G -->|No| H[UMA Error]
    G -->|Yes| I[Success]
```

## Key Differences Summary

| Aspect | Complex Version | Simplified Version |
|--------|----------------|-------------------|
| **Message Direction** | Bidirectional | Unidirectional |
| **Bond Management** | Cross-chain | UMA side only |
| **Assertion Submission** | PM side | UMA side |
| **State Complexity** | High | Low |
| **Deployment** | Complex | Simple |
| **Message Types** | 3 | 2 |
| **Access Control** | Both sides | UMA side only |
| **Maintenance** | Complex | Simple |

## Security Considerations

### Complex Version Security
- Cross-chain bond transfers
- Multiple access control points
- Complex state synchronization
- Bidirectional message validation

### Simplified Version Security
- Centralized bond management
- Single access control point
- Simple state management
- Unidirectional message flow
