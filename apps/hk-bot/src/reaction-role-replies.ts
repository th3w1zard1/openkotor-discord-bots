import type { CuratedRoleDefinition } from "@openkotor/personas";

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

export const pickReactionSuccessLine = (
  direction: "add" | "remove",
  roleDisplayName: string,
  curated: CuratedRoleDefinition | undefined,
): string => {
  const roleLabel = roleDisplayName;
  const flavor = curated?.flavor ?? "";
  const category = curated?.category ?? "";
  const genericAssign = [
    `Statement: ${roleLabel} designation acquired. Do try not to embarrass the module.`,
    `Statement: Tagging you for ${roleLabel}. The station thanks you for your voluntary categorization.`,
    `Observation: ${roleLabel} is now active. I will monitor your enthusiasm with mild interest.`,
    flavor
      ? `Statement: ${roleLabel} locked in. Context: ${flavor}`
      : `Statement: ${roleLabel} locked in. Proceed with your meatbag agenda.`,
  ];

  const genericRemove = [
    `Statement: ${roleLabel} designation removed. Your loss is statistically insignificant.`,
    `Statement: You have shed ${roleLabel}. I pretend to miss it.`,
    `Observation: ${roleLabel} cleared. I will adjust targeting priorities accordingly.`,
    flavor
      ? `Statement: ${roleLabel} revoked. Previously: ${flavor}`
      : `Statement: ${roleLabel} revoked. Efficiency improved.`,
  ];

  const sectorFlavor =
    category === "Sectors"
      ? [
          `Statement: Sector tag ${roleLabel} applied. May your chronometer align with propaganda.`,
          `Statement: ${roleLabel} updated. The galaxy remains indifferent.`,
        ]
      : [];

  const pool =
    direction === "add"
      ? [...genericAssign, ...(sectorFlavor.length ? sectorFlavor : [])]
      : [...genericRemove, ...(category === "Sectors" ? [`Statement: ${roleLabel} sector flag dropped.`] : [])];

  return pick(pool);
};

export const pickReactionErrorLine = (kind: "missing" | "blocked", roleLabel: string): string => {
  if (kind === "missing") {
    return pick([
      `Observation: Guild lacks a concrete role for ${roleLabel}. Complain upward.`,
      `Observation: ${roleLabel} cannot be applied — role missing from guild. Administrative meatbags required.`,
    ]);
  }

  return pick([
    `Mockery: Hierarchy denied ${roleLabel}. Elevate this unit or accept defeat.`,
    `Mockery: I cannot touch ${roleLabel} — some fool ordered roles incorrectly.`,
  ]);
};

export const pickReactionNoopLine = (direction: "add" | "remove", roleDisplayName: string): string => {
  if (direction === "add") {
    return pick([
      `Observation: You already carry ${roleDisplayName}. Redundant input detected.`,
      `Statement: ${roleDisplayName} unchanged — you already optimized this.`,
    ]);
  }

  return pick([
    `Observation: ${roleDisplayName} was already absent. Dramatic gesture wasted.`,
    `Statement: No ${roleDisplayName} to strip. Try reacting when it matters.`,
  ]);
};
