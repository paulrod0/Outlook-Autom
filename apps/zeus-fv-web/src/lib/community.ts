/**
 * Comunidad Energética (autoconsumo colectivo).
 *
 * Modelo simplificado para el diseño preliminar:
 *  - Una instalación generadora repartida entre N miembros (consumidores).
 *  - Cada miembro tiene un coeficiente de reparto βᵢ (0..1). La suma de
 *    coeficientes debería ser 1 (100% de la generación repartida).
 *  - El reparto puede ser estático: por consumo, equitativo o manual.
 *
 * El reparto horario dinámico (coeficientes que varían hora a hora) queda
 * fuera del MVP — requiere las curvas de consumo horarias de los chips.
 */

export type CommunityMember = {
  id: string;
  name: string;
  cups?: string;
  annualConsumptionKwh: number;
  coefficient: number; // 0..1
};

export type MemberResult = {
  member: CommunityMember;
  assignedKwh: number; // energía anual asignada por su coeficiente
  coveragePct: number; // % de su consumo cubierto por la asignación
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newMember(partial?: Partial<CommunityMember>): CommunityMember {
  return {
    id: uid(),
    name: partial?.name ?? "Nuevo miembro",
    cups: partial?.cups,
    annualConsumptionKwh: partial?.annualConsumptionKwh ?? 0,
    coefficient: partial?.coefficient ?? 0,
  };
}

/** Reparte los coeficientes proporcionalmente al consumo anual. */
export function distributeByConsumption(
  members: CommunityMember[],
): CommunityMember[] {
  const totalConsumption = members.reduce(
    (acc, m) => acc + Math.max(0, m.annualConsumptionKwh),
    0,
  );
  if (totalConsumption <= 0) return distributeEqually(members);
  return members.map((m) => ({
    ...m,
    coefficient: Math.max(0, m.annualConsumptionKwh) / totalConsumption,
  }));
}

/** Reparte los coeficientes a partes iguales. */
export function distributeEqually(
  members: CommunityMember[],
): CommunityMember[] {
  if (members.length === 0) return members;
  const c = 1 / members.length;
  return members.map((m) => ({ ...m, coefficient: c }));
}

/** Normaliza los coeficientes para que sumen 1 (respetando proporciones). */
export function normalizeCoefficients(
  members: CommunityMember[],
): CommunityMember[] {
  const total = members.reduce((acc, m) => acc + Math.max(0, m.coefficient), 0);
  if (total <= 0) return distributeEqually(members);
  return members.map((m) => ({
    ...m,
    coefficient: Math.max(0, m.coefficient) / total,
  }));
}

export function coefficientSum(members: CommunityMember[]): number {
  return members.reduce((acc, m) => acc + m.coefficient, 0);
}

export function computeMemberResults(
  members: CommunityMember[],
  generationKwh: number,
): MemberResult[] {
  return members.map((m) => {
    const assignedKwh = generationKwh * m.coefficient;
    const coveragePct =
      m.annualConsumptionKwh > 0
        ? (assignedKwh / m.annualConsumptionKwh) * 100
        : 0;
    return {
      member: m,
      assignedKwh: Math.round(assignedKwh),
      coveragePct: Math.round(coveragePct),
    };
  });
}

export function totalCommunityConsumption(members: CommunityMember[]): number {
  return members.reduce((acc, m) => acc + Math.max(0, m.annualConsumptionKwh), 0);
}
