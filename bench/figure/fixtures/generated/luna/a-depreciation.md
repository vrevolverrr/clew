Straight-line depreciation spreads the depreciable amount evenly across the asset’s life. Double-declining-balance (DDB) records more depreciation early, then less each year. Both methods stop at the $5,000 salvage value.

For straight-line depreciation:

$$
\text{Annual depreciation}=\frac{\text{cost}-\text{salvage value}}{\text{useful life}}
$$

That is $(\$50{,}000-\$5{,}000)/5=\$9{,}000$ per year.

For DDB, the rate is twice the straight-line rate, applied to the asset’s beginning book value. Depreciation is capped so book value does not fall below salvage.

$$
\text{DDB rate}=\frac{2}{5}=40\%
$$

| Year | Straight-line depreciation | Straight-line ending value | DDB depreciation | DDB ending value |
|---:|---:|---:|---:|---:|
| 1 | $9,000 | $41,000 | $20,000 | $30,000 |
| 2 | $9,000 | $32,000 | $12,000 | $18,000 |
| 3 | $9,000 | $23,000 | $7,200 | $10,800 |
| 4 | $9,000 | $14,000 | $4,320 | $6,480 |
| 5 | $9,000 | $5,000 | $1,480* | $5,000 |

\*The uncapped DDB amount would be $2,592, which would put book value below salvage. It is capped at $1,480.

```figure
export default function () {
  return (
    <Plot id="book-value" x={[0, 5]} y={[0, 50000]} xLabel="Year" yLabel="Ending book value ($)">
      <Shape id="sl-line" pts={[[0, 50000], [1, 41000], [2, 32000], [3, 23000], [4, 14000], [5, 5000]]} label="Straight-line" />
      <Points id="sl-points" pts={[[0, 50000], [1, 41000], [2, 32000], [3, 23000], [4, 14000], [5, 5000]]} />
      <Shape id="ddb-line" pts={[[0, 50000], [1, 30000], [2, 18000], [3, 10800], [4, 6480], [5, 5000]]} label="Double-declining balance" />
      <Points id="ddb-points" pts={[[0, 50000], [1, 30000], [2, 18000], [3, 10800], [4, 6480], [5, 5000]]} />
    </Plot>
  );
}
```

DDB gives larger deductions in the first years; straight-line keeps annual depreciation constant.

