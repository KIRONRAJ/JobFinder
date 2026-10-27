// Characters Matcha Style actually has (read from its cmap). It lacks the middle dot, dashes, arrows, check
// marks and Latin Extended-A letters such as the macron vowels in Maori place names, so user data shown in
// Matcha Style is checked against this and falls back to the body font when anything is missing.
const GLYPHS = new Set("\u0000\n\n !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a8\u00a9\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b4\u00b6\u00b8\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff\u0141\u0142\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02c7\u02dc\u1e9e\u2018\u2019\u201a\u201c\u201d\u201e\u2026\u2030\u20ac\u2122\u2212");

export const fitsMatchaStyle = (text: string): boolean => [...text].every((c) => GLYPHS.has(c));
