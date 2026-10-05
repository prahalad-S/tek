import type { ExtendedProfile } from "./profiles";
// Only these explicitly requested fields may be included in an authorized private export.
export function personalExportRows(
  profile: ExtendedProfile,
  includePrivate = false,
): [string, string][] {
  if (!includePrivate || !profile.privateDetails) return [];
  const fields = [
    ["phone", "Phone number"],
    ["marital_status", "Marital status"],
    ["blood_group", "Blood group"],
    ["gender", "Gender"],
    ["home_number", "Home / alternate phone"],
    ["address", "Address"],
  ];
  return fields.map(([key, label]) => [
    label,
    profile.privateDetails![key]?.trim() || "Not added",
  ]);
}
