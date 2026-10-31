Launching has expected net value $0.6($150k-$50k)+0.4($20k-$50k)=$48k$. Since not launching is worth $0, launching has the higher expected value.

```figure
export default function () {
  return (
    <Graph
      nodes={[
        { id: "decision", label: "Decision", sub: "Choose" },
        { id: "launch", label: "Launch", sub: "EV +$48k" },
        { id: "chance", label: "Sales outcome", sub: "After $50k cost" },
        { id: "high", label: "+$100k", sub: "60% chance" },
        { id: "low", label: "−$30k", sub: "40% chance" },
        { id: "skip", label: "Do not launch", sub: "EV $0" }
      ]}
      edges={[
        { id: "e1", from: "decision", to: "launch", label: "Launch", directed: true },
        { id: "e2", from: "launch", to: "chance", directed: true },
        { id: "e3", from: "chance", to: "high", label: "60%", directed: true },
        { id: "e4", from: "chance", to: "low", label: "40%", directed: true },
        { id: "e5", from: "decision", to: "skip", label: "Do not launch", directed: true }
      ]}
    />
  );
}
```

