import { encodeAbiParameters, decodeAbiParameters } from 'viem';

// Your predicted outcomes from the database
const outcomes = [
  {
    conditionId: "0x7a5720fd8299e5b6c091fce1cfb9b61b8a16801c8dc37b6caa8ef02ca09bd295" as `0x${string}`,
    prediction: false
  },
  {
    conditionId: "0xba6834aa8b3b05973b6e9ff70216b702cc5e7f997ca3aa69fabfe47e2c22c1dc" as `0x${string}`,
    prediction: true
  },
  {
    conditionId: "0x7bf4b2b92e6129710c3668f25b5acc9294f3b72f046fc3687119631d1c19a5b3" as `0x${string}`,
    prediction: true
  }
];

// Convert to the format the contract expects: tuple(bytes32,bool)[]
const formattedOutcomes = outcomes.map(o => [o.conditionId, o.prediction] as [`0x${string}`, boolean]);

// Encode it
const encoded = encodeAbiParameters(
  [
    {
      type: 'tuple[]',
      components: [{ type: 'bytes32' }, { type: 'bool' }]
    }
  ],
  [formattedOutcomes]
);

console.log('\n=== ENCODED PREDICTED OUTCOMES ===');
console.log(encoded);
console.log('\n=== Copy this value into Etherscan encodedPredictedOutcomes field ===\n');

// Also show the decoded version to verify
const [decoded] = decodeAbiParameters(
  [
    {
      type: 'tuple[]',
      components: [{ type: 'bytes32' }, { type: 'bool' }]
    }
  ],
  encoded
);

console.log('Verification (decoded):');
decoded.forEach((outcome, i) => {
  console.log(`  ${i + 1}. conditionId: ${outcome[0]}, prediction: ${outcome[1]}`);
});

console.log('\n=== OTHER PARAMETERS ===');
console.log('orderDeadline: 1767225600  (Unix timestamp - Dec 31, 2025)');
console.log('resolver: 0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9');
console.log('makerCollateral: 1000000  (1 USDC)');
console.log('takerCollateral: 1000000  (1 USDC)');
console.log('refCode: 0x7465737400000000000000000000000000000000000000000000000000000000');

