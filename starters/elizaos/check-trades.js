const address = "0x29f9ff5bb613ec5121283bd171931a8b21b1c2cd";
const graphqlUrl = "https://api.sapience.xyz/graphql";

// Try different queries to find trades
const queries = [
  {
    name: "positions",
    query: `
      query {
        positions(take: 100) {
          id
          mintedAt
          settledAt
          totalCollateral
          user
          condition {
            id
            question
            shortName
          }
        }
      }
    `
  }
];

async function checkTrades() {
  for (const { name, query } of queries) {
    try {
      console.log(`\n=== Trying ${name} query ===`);
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      
      if (data.errors) {
        console.log(`Errors:`, JSON.stringify(data.errors, null, 2));
      } else {
        console.log(`Success! Data:`, JSON.stringify(data.data, null, 2));
        if (data.data && Object.keys(data.data).length > 0) {
          return data.data;
        }
      }
    } catch (error) {
      console.log(`Error with ${name}:`, error.message);
    }
  }
}

checkTrades().catch(console.error);

