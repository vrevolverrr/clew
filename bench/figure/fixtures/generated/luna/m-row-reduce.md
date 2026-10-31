The solution is \(x=-\frac{51}{22},\ y=\frac{307}{110},\ z=\frac{133}{220},\ w=\frac{59}{44}\). Here is the row reduction, with each matrix showing the result of the operation in its caption.

```figure
const steps = [
  {
    text: 'Start with the augmented matrix.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\2&3&1&-1&3\\-1&1&2&2&9\\3&-1&1&1&4\end{array}\right]`
  },
  {
    text: 'Apply $R_2\leftarrow R_2-2R_1$, $R_3\leftarrow R_3+R_1$, and $R_4\leftarrow R_4-3R_1$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&-1&3&-3&-5\\0&3&1&3&13\\0&-7&4&-2&-8\end{array}\right]`
  },
  {
    text: 'Make the second pivot positive: $R_2\leftarrow -R_2$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&-3&3&5\\0&3&1&3&13\\0&-7&4&-2&-8\end{array}\right]`
  },
  {
    text: 'Clear the entries below that pivot: $R_3\leftarrow R_3-3R_2$, $R_4\leftarrow R_4+7R_2$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&-3&3&5\\0&0&10&-6&-2\\0&0&-17&19&27\end{array}\right]`
  },
  {
    text: 'Clear the third entry in row 4: $R_4\leftarrow R_4+\frac{17}{10}R_3$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&-3&3&5\\0&0&10&-6&-2\\0&0&0&\frac{44}{5}&\frac{118}{5}\end{array}\right]`
  },
  {
    text: 'Normalize the fourth pivot: $R_4\leftarrow \frac{5}{44}R_4$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&-3&3&5\\0&0&10&-6&-2\\0&0&0&1&\frac{59}{44}\end{array}\right]`
  },
  {
    text: 'Clear the fourth entry in row 3: $R_3\leftarrow R_3+6R_4$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&-3&3&5\\0&0&10&0&\frac{133}{22}\\0&0&0&1&\frac{59}{44}\end{array}\right]`
  },
  {
    text: 'Normalize the third pivot: $R_3\leftarrow \frac{1}{10}R_3$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&-3&3&5\\0&0&1&0&\frac{133}{220}\\0&0&0&1&\frac{59}{44}\end{array}\right]`
  },
  {
    text: 'Clear the third and fourth entries in row 2: $R_2\leftarrow R_2+3R_3-3R_4$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&2&-1&1&4\\0&1&0&0&\frac{307}{110}\\0&0&1&0&\frac{133}{220}\\0&0&0&1&\frac{59}{44}\end{array}\right]`
  },
  {
    text: 'Clear the remaining entries in row 1: $R_1\leftarrow R_1-2R_2+R_3-R_4$.',
    matrix: String.raw`\left[\begin{array}{rrrr|r}1&0&0&0&-\frac{51}{22}\\0&1&0&0&\frac{307}{110}\\0&0&1&0&\frac{133}{220}\\0&0&0&1&\frac{59}{44}\end{array}\right]`
  }
];

export default function () {
  return <Figure steps={steps} caption={step => step.text} render={step => <Tex tex={step.matrix} />} />;
}
```

The final matrix gives \(x=-\frac{51}{22},\ y=\frac{307}{110},\ z=\frac{133}{220},\ w=\frac{59}{44}\).

