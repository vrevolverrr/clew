Here’s a three-year dashboard. I used Year 1–3 because no calendar years were given. Liabilities are calculated as total assets minus equity; ROA and ROE use year-end balances.

| Ratio | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Current ratio | 2.00 | 1.50 | 1.31 |
| Quick ratio | 1.25 | 0.83 | 0.69 |
| Net profit margin | 10.00% | 6.92% | 3.13% |
| Return on assets (ROA) | 6.67% | 4.50% | 1.90% |
| Return on equity (ROE) | 12.00% | 8.65% | 3.92% |
| Asset turnover | 0.67× | 0.65× | 0.61× |
| Debt ratio | 44.44% | 48.00% | 51.43% |
| Debt-to-equity | 0.80× | 0.92× | 1.06× |

Current ratio is current assets divided by current liabilities. Quick ratio uses current assets minus inventory, divided by current liabilities. The remaining ratios compare income, revenue, assets, and equity; debt ratios use liabilities derived from assets less equity.

```figure
export default function () {
  return (
    <Row gap="lg">
      <Plot id="liquidity" x={[1, 3]} y={[0, 2.2]} xLabel="Year" yLabel="Ratio">
        <Shape id="current" label="Current ratio" pts={[[1, 2], [2, 1.5], [3, 1.31]]} />
        <Shape id="quick" label="Quick ratio" pts={[[1, 1.25], [2, 0.83], [3, 0.69]]} />
      </Plot>
      <Plot id="profitability" x={[1, 3]} y={[0, 13]} xLabel="Year" yLabel="Percent">
        <Shape id="margin" label="Net profit margin" pts={[[1, 10], [2, 6.92], [3, 3.13]]} />
        <Shape id="roa" label="ROA" pts={[[1, 6.67], [2, 4.5], [3, 1.9]]} />
        <Shape id="roe" label="ROE" pts={[[1, 12], [2, 8.65], [3, 3.92]]} />
      </Plot>
    </Row>
  );
}
```

Both liquidity ratios and profitability declined across the period, while the debt ratio and debt-to-equity rose. ROA and ROE based on average balances may differ; average balances were not provided.

  
