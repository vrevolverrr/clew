I’ll show each stage with its count and the conversion from the stage before it, plus the overall visitor-to-renewal rate.

Each rate is the share of the previous stage that moved forward.

```figure
export default function () {
  return (
    <Column gap="md">
      <Graph
        id="funnel"
        nodes={[
          { id: "visitors", label: "Visitors · 10,000" },
          { id: "signups", label: "Sign-ups · 2,400" },
          { id: "trials", label: "Trials · 900" },
          { id: "customers", label: "Customers · 300" },
          { id: "renewals", label: "Renewals · 120" },
        ]}
        edges={[
          { id: "to-signups", from: "visitors", to: "signups", label: "24%" },
          { id: "to-trials", from: "signups", to: "trials", label: "37.5%" },
          { id: "to-customers", from: "trials", to: "customers", label: "33.3%" },
          { id: "to-renewals", from: "customers", to: "renewals", label: "40%" },
        ]}
      />
      <Text>Overall: 120 of 10,000 visitors renewed (1.2%).</Text>
    </Column>
  );
}
```

