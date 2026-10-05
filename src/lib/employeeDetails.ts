export function tenureSince(joined: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joined)) return "Joining date not added";
  const [y, m, d] = joined.split("-").map(Number),
    start = new Date(Date.UTC(y, m - 1, d)),
    today = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
  if (
    start.getUTCFullYear() !== y ||
    start.getUTCMonth() !== m - 1 ||
    start.getUTCDate() !== d
  )
    return "Joining date not added";
  if (start > today) return "Joining date is in the future";
  let months =
    (today.getUTCFullYear() - y) * 12 + today.getUTCMonth() - (m - 1);
  const anniversary = (n: number) => {
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    return new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        Math.min(
          d,
          new Date(
            Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
          ).getUTCDate(),
        ),
      ),
    );
  };
  if (anniversary(months) > today) months--;
  const years = Math.floor(months / 12),
    remaining = months % 12,
    days = Math.floor((+today - +anniversary(months)) / 86400000);
  return (
    [
      [years, "year"],
      [remaining, "month"],
      [days, "day"],
    ]
      .filter(([n]) => n !== 0)
      .map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`)
      .join(", ") || "Joined today"
  );
}
export function showDocument(
  category: string,
  title: string,
  location: string,
) {
  const ceo = /\bceo\b|chief\s+executive\s+officer/i.test(title);
  if (
    ceo &&
    [
      "pan_card",
      "aadhaar_card",
      "payslip",
      "joining_letter",
      "relieving_letter",
    ].includes(category)
  )
    return false;
  if (["pan_card", "aadhaar_card"].includes(category))
    return /\bindia\b|symbiosys|,\s*IN\b/i.test(location);
  return true;
}
export const personalChoices: Record<string, string[]> = {
  gender: [
    "Female",
    "Male",
    "Non-binary",
    "Self-described",
    "Prefer not to say",
  ],
  marital_status: [
    "Single",
    "Married",
    "Divorced",
    "Widowed",
    "Separated",
    "Prefer not to say",
  ],
  blood_group: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"],
};
