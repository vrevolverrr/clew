**Result:** Pratt diagonals and end posts carry the load. Positive = tension, negative = compression.

**Setup:** Bottom joints B0 to B4 sit at x = 0, 3, 6, 9, 12 m (y = 0). Top joints T0 to T4 sit at y = 3 m. Pin at B0, roller at B4. Each of B1, B2, B3 carries 10 kN down.

**Reactions:** Load is symmetric, total 30 kN, so R_A = R_B = 15 kN up.

| Member | Force (kN) | Type |
|---|---|---|
| Top chord T0-T1, T3-T4 | −15 | Compression |
| Top chord T1-T2, T2-T3 | −20 | Compression |
| Bottom chord B0-B1, B3-B4 | 0 | Zero-force |
| Bottom chord B1-B2, B2-B3 | +15 | Tension |
| End posts V0, V4 | −15 | Compression |
| Verticals V1, V3 | −5 | Compression |
| Centre vertical V2 | 0 | Zero-force |
| End diagonals D1 (T0-B1), D4 (T4-B3) | +21.2 | Tension |
| Inner diagonals D2 (T1-B2), D3 (T3-B2) | +7.07 | Tension |

**Key steps:**
1. Joint B0: ΣFy gives V0 = −15. ΣFx gives B0-B1 = 0.
2. Joint T0: ΣFy gives 15 − D1/√2 = 0, so D1 = 15√2 = 21.2 (T). ΣFx gives T0-T1 = −15.
3. Joint B1: ΣFy gives 15 + V1 − 10 = 0, so V1 = −5. ΣFx gives B1-B2 = +15.
4. Section at x = 4.5 m, moments about T1: B1-B2 = 15 (T).
5. Same section, moments about B2: T1-T2 = −20 (C).
6. Same section, ΣFy: D2 = 5√2 = 7.07 (T).
7. Joint T2: ΣFy gives V2 = 0. Symmetry gives the right half.

**Not checked:** I did not run a software model. I assumed no self-weight and loads only at the bottom joints. If the supports sit at the top chord instead, every result changes.