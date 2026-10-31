A **Markov chain** models a system that moves between states using fixed transition probabilities. Here, each row gives the weather today and each column gives the weather tomorrow, in the order sunny, cloudy, rainy. Starting sunny, the day-by-day distribution is updated by multiplying by the transition matrix:

$$
p_{t+1}=p_tP
$$

Here, $p_t$ is the distribution on day $t$, and $P$ is the transition matrix. For example, after one day the distribution is $(0.6, 0.3, 0.1)$. After five days, it is approximately $(0.39742, 0.35959, 0.24299)$.

```figure
export default function () {
  return (
    <Column gap="md">
      <Panel title="Weather transitions">
        <Graph
          id="weather"
          nodes={[
            { id: "sunny", label: "Sunny" },
            { id: "cloudy", label: "Cloudy" },
            { id: "rainy", label: "Rainy" }
          ]}
          edges={[
            { id: "ss", from: "sunny", to: "sunny", label: "0.6", directed: true },
            { id: "sc", from: "sunny", to: "cloudy", label: "0.3", directed: true },
            { id: "sr", from: "sunny", to: "rainy", label: "0.1", directed: true },
            { id: "cs", from: "cloudy", to: "sunny", label: "0.3", directed: true },
            { id: "cc", from: "cloudy", to: "cloudy", label: "0.4", directed: true },
            { id: "cr", from: "cloudy", to: "rainy", label: "0.3", directed: true },
            { id: "rs", from: "rainy", to: "sunny", label: "0.2", directed: true },
            { id: "rc", from: "rainy", to: "cloudy", label: "0.4", directed: true },
            { id: "rr", from: "rainy", to: "rainy", label: "0.4", directed: true }
          ]}
        />
      </Panel>
      <Table
        id="distributions"
        title="Chance of each weather state"
        columns={["Day", "Sunny", "Cloudy", "Rainy"]}
        rowIds={["d0", "d1", "d2", "d3", "d4", "d5"]}
        rows={[
          ["0", "100%", "0%", "0%"],
          ["1", "60%", "30%", "10%"],
          ["2", "47%", "34%", "19%"],
          ["3", "42.2%", "35.3%", "22.5%"],
          ["4", "40.41%", "35.78%", "23.81%"],
          ["5", "39.742%", "35.959%", "24.299%"]
        ]}
      />
    </Column>
  );
}
```

