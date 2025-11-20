import { defineConfig } from "vocs";

export default defineConfig({
  title: "Sapience",
  logoUrl: "/logo.svg",
  head: [
    ["link", { rel: "stylesheet", href: "/styles.css" }],
  ] as any,
  theme: {
    colorScheme: "dark",
    accentColor: {
      backgroundAccent: {
        light: "rgba(145, 179, 240, 0.2)",
        dark: "rgba(145, 179, 240, 0.2)",
      },
      backgroundAccentHover: {
        light: "rgba(145, 179, 240, 0.3)",
        dark: "rgba(145, 179, 240, 0.3)",
      },
      backgroundAccentText: {
        light: "black",
        dark: "white",
      },
      borderAccent: {
        light: "rgba(145, 179, 240, 0.8)",
        dark: "rgba(145, 179, 240, 0.8)",
      },
      textAccent: {
        light: "#91B3F0",
        dark: "#91B3F0",
      },
      textAccentHover: {
        light: "#7AA1EE",
        dark: "#7AA1EE",
      },
    },
  },
  sidebar: {
    "/": [
      { text: "Open App", link: "https://sapience.xyz" },
      { text: "User Guide", link: "/user-guide/introduction/what-is-sapience", match: "/user-guide" as any },
      { text: "Builder Guide", link: "/builder-guide/getting-started/get-started", match: "/builder-guide" as any },
      {
        text: "Build Something Awesome",
        items: [
          { text: "Get Started", link: "/builder-guide/getting-started/get-started" },
          { text: "Forecasting Agent", link: "/builder-guide/guides/forecasting-agent" },
          {
            text: "Trading Agent",
            link: "/builder-guide/guides/trading-auction-intent-markets",
          },
          {
            text: "Market Making Agent",
            link: "/builder-guide/guides/market-making-agent",
          },
          {
            text: "Spot Market Trading Agent",
            link: "/builder-guide/guides/trading-bots",
          },
          {
            text: "Spot Market Liquidity Agent",
            link: "/builder-guide/guides/liquidity-provisioning-bots",
          },
          { text: "Customize Trading App", link: "/builder-guide/guides/customize-trading-app" },
          {
            text: "Dashboards, Games, and more",
            link: "/builder-guide/guides/design-dashboards-games",
          },
        ],
      },
      {
        text: "API",
        items: [
          { text: "GraphQL", link: "/builder-guide/api/graphql" },
          { text: "Quoter", link: "/builder-guide/api/quoter" },
          { text: "Auction Relayer", link: "/builder-guide/api/auction-relayer" },
          { text: "MCP", link: "/builder-guide/api/mcp" },
        ],
      },
      {
        text: "Reference",
        items: [
          {
            text: "Contracts & Addresses",
            link: "/builder-guide/reference/contracts-and-addresses",
          },
          { text: "GraphQL Schema", link: "/builder-guide/reference/graphql-schema" },
          { text: "Auction Relayer", link: "/builder-guide/reference/auction-relayer" },
          {
            text: "Oracles & Settlement",
            link: "/builder-guide/reference/oracles-and-settlement",
          },
          { text: "UI Components", link: "/builder-guide/storybook" },
        ],
      },
      { text: "FAQ", link: "/builder-guide/faq" },
      { text: "Contributing", link: "/builder-guide/contributing" },
    ],
    "/user-guide": [
      { text: "Open App", link: "https://sapience.xyz" },
      { text: "User Guide", link: "/user-guide/introduction/what-is-sapience", match: "/user-guide" as any },
      { text: "Builder Guide", link: "/builder-guide/getting-started/get-started", match: "/builder-guide" as any },
      {
        text: "Introduction",
        items: [
          {
            text: "What is Sapience?",
            link: "/user-guide/introduction/what-is-sapience",
          },
          {
            text: "Glossary",
            link: "/user-guide/other-resources/glossary",
          },
        ],
      },
      {
        text: "Trading Prediction Markets",
        items: [
          { text: "Overview", link: "/user-guide/trading/overview" },
          { text: "Auction Markets", link: "/user-guide/trading/auction-markets" },
          { text: "Spot Markets", link: "/user-guide/trading/spot-markets" },
          { text: "Verification & Settlement", link: "/user-guide/trading/resolution-and-disputes" },
        ],
      },
      {
        text: "Providing Liquidity",
        items: [
          { text: "Overview", link: "/user-guide/liquidity-overview" },
          { text: "Auction Liquidity", link: "/user-guide/batch-auction-liquidity" },
          { text: "Spot Liquidity", link: "/user-guide/liquidity-provisioning" },
          { text: "Liquidity Vaults", link: "/user-guide/liquidity-vaults" },
        ],
      },
      {
        text: "Resources",
        items: [
          { text: "Audits", link: "/user-guide/other-resources/audits" },
          {
            text: "Brand Assets",
            link: "/user-guide/other-resources/brand-assets",
          },
          {
            text: "Community",
            link: "/user-guide/other-resources/community",
          },
          { text: "FAQ", link: "/user-guide/other-resources/faq" },
        ],
      },
    ],
  },
} as any);
