Porter’s five forces show where pressure on a business’s profits comes from. For a coffee shop chain, the five pressures are:

```figure
export default function () {
  return (
    <Graph
      id="forces"
      nodes={[
        { id: "chain", label: "Coffee shop chain" },
        { id: "rivalry", label: "Rivalry", sub: "Other cafés compete for customers" },
        { id: "entrants", label: "New entrants", sub: "New cafés can open nearby" },
        { id: "substitutes", label: "Substitutes", sub: "Tea, home coffee, convenience stores" },
        { id: "buyers", label: "Buyer power", sub: "Customers can switch easily" },
        { id: "suppliers", label: "Supplier power", sub: "Coffee, milk, and labor costs" }
      ]}
      edges={[
        { id: "e1", from: "chain", to: "rivalry", directed: true },
        { id: "e2", from: "chain", to: "entrants", directed: true },
        { id: "e3", from: "chain", to: "substitutes", directed: true },
        { id: "e4", from: "chain", to: "buyers", directed: true },
        { id: "e5", from: "chain", to: "suppliers", directed: true }
      ]}
    />
  );
}
```

Each force can limit profits: strong rivalry and easy switching can push prices down, while powerful suppliers can push costs up. New cafés and substitute drinks give customers more choices. The model helps a chain decide where to respond, such as differentiating its drinks or negotiating supply contracts.

