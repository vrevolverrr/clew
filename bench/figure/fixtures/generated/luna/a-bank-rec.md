A **bank reconciliation** explains why the bank statement and the cash balance in the books differ, then adjusts both for items not yet recorded on one side.

First, adjust the bank balance for timing differences. Subtract outstanding cheques because they are in the books but have not cleared the bank: $8,400 − $1,200 = $7,200. Add the deposit in transit because it is in the books but has not appeared at the bank: $7,200 + $900 = **$8,100**.

Next, adjust the book balance for items the bank recorded and the books have not. Subtract the $50 bank fee and the $200 NSF cheque. The cheque error needs a correction too: the books reduced cash by $540, but the cheque was only $450, so add back the extra $90. The adjusted book balance is $7,950 − $50 − $200 + $90 = **$7,790**.

The two adjusted balances differ by **$310**. A completed reconciliation should bring them to the same amount, so there is still a $310 discrepancy to investigate.

```figure
const bankStart = 8400;
const outstanding = 1200;
const deposit = 900;
const bankAdjusted = bankStart - outstanding + deposit;

const bookStart = 7950;
const fee = 50;
const nsf = 200;
const errorCorrection = 540 - 450;
const booksAdjusted = bookStart - fee - nsf + errorCorrection;

const steps = [
  {
    active: 'bank',
    bank: bankStart,
    outstanding: '—',
    deposit: '—',
    bankAdjusted: '—',
    books: bookStart,
    fee: '—',
    nsf: '—',
    correction: '—',
    booksAdjusted: '—',
    text: 'Start with the balances shown by the bank and the books.'
  },
  {
    active: 'timing',
    bank: bankStart,
    outstanding: `−${outstanding}`,
    deposit: `+${deposit}`,
    bankAdjusted,
    books: bookStart,
    fee: '—',
    nsf: '—',
    correction: '—',
    booksAdjusted: '—',
    text: 'Adjust the bank side for cheques and deposits that have not cleared yet.'
  },
  {
    active: 'books',
    bank: bankStart,
    outstanding: `−${outstanding}`,
    deposit: `+${deposit}`,
    bankAdjusted,
    books: bookStart,
    fee: `−${fee}`,
    nsf: `−${nsf}`,
    correction: `+${errorCorrection}`,
    booksAdjusted,
    text: 'Adjust the books for the fee, NSF cheque, and cheque recording error.'
  },
  {
    active: 'compare',
    bank: bankStart,
    outstanding: `−${outstanding}`,
    deposit: `+${deposit}`,
    bankAdjusted,
    books: bookStart,
    fee: `−${fee}`,
    nsf: `−${nsf}`,
    correction: `+${errorCorrection}`,
    booksAdjusted,
    difference: bankAdjusted - booksAdjusted,
    text: `The adjusted balances differ by $${bankAdjusted - booksAdjusted}; investigate the remaining discrepancy.`
  }
];

export default function () {
  return (
    <Figure steps={steps} caption={step => step.text} render={step => (
      <Table
        id="reconciliation"
        title="Reconciliation"
        columns={['Item', 'Bank side', 'Book side']}
        rowIds={['bank', 'cheques', 'deposit', 'bankAdjusted', 'books', 'fee', 'nsf', 'correction', 'booksAdjusted']}
        rows={[
          ['Starting balance', step.bank, step.books],
          ['Outstanding cheques', step.outstanding, '—'],
          ['Deposit in transit', step.deposit, '—'],
          ['Adjusted bank balance', step.bankAdjusted, '—'],
          ['Book balance', '—', step.books],
          ['Bank fee', '—', step.fee],
          ['NSF cheque', '—', step.nsf],
          ['Cheque error correction', '—', step.correction],
          ['Adjusted book balance', '—', step.booksAdjusted]
        ]}
        tags={{
          ...(step.active === 'bank' ? { bank: 'active', books: 'active' } : {}),
          ...(step.active === 'timing' ? { cheques: 'active', deposit: 'active', bankAdjusted: 'active' } : {}),
          ...(step.active === 'books' ? { fee: 'active', nsf: 'active', correction: 'active', booksAdjusted: 'active' } : {}),
          ...(step.active === 'compare' ? { bankAdjusted: 'bad', booksAdjusted: 'bad' } : {})
        }}
      />
    )} />
  );
}
```

