import { doctor } from "../src/doctor.mjs";
// Build downloadable plans only from the checker's validated public projection.
export function reviewPlan(input) {
  const report = doctor(input);
  const plan =
    report.status === "plan_checks_passed"
      ? {
          ...report.plan,
          tokenProgram: "token2022",
          mayhemMode: false,
          cashback: false,
          creatorFeeBps: 0,
        }
      : null;
  return { report, plan };
}
