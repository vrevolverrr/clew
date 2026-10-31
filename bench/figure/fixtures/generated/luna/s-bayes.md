A positive result can still be a false alarm because the disease is rare: there are many more healthy people who can test positive by mistake than sick people who test positive correctly.

**Sensitivity** is the share of people with the disease who test positive. **Specificity** is the share of people without it who test negative. To find the chance that a positive result is a false alarm, compare false positives with all positive results:

$$
P(\text{no disease}\mid\text{positive}) =
\frac{\text{false positives}}{\text{true positives}+\text{false positives}}
$$

Imagine testing 10,000 people. At 1% prevalence, 100 have the disease and 9,900 do not. The test detects 95% of the 100 sick people, giving 95 true positives. With 90% specificity, 10% of the 9,900 healthy people test positive by mistake: 990 false positives. So 990 of the 1,085 positive results are false alarms, about **91%**.

```figure
export default function () {
  return (
    <Table
      id="cohort"
      title="Results among 10,000 people"
      columns={["", "Positive", "Negative", "Total"]}
      rows={[
        ["Disease", 95, 5, 100],
        ["No disease", 990, 8910, 9900],
        ["Total", 1085, 8915, 10000]
      ]}
      rowIds={["disease", "healthy", "total"]}
      tags={{ "disease.1": "good", "healthy.1": "bad" }}
    />
  );
}
```

