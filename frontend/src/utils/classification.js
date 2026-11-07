export function formatRelativeShare(c) {
  if (c == null || !Number.isFinite(Number(c))) return "—";
  const n = Number(c);
  if (n > 1) return `${n.toFixed(2)} (старый формат: не нормализовано)`;
  return `${(n * 100).toFixed(1)} %`;
}

export function interpretClassification(result) {
  const share = result.relative_score_share ?? result.confidence;
  let marginRaw = result.margin_raw;
  let marginShare = result.margin_share;
  let runnerUp = result.runner_up_category;
  let onlyOne = result.only_one_scoring_class;

  if (
    marginRaw == null &&
    result.all_scores_by_name &&
    Object.keys(result.all_scores_by_name).length > 0
  ) {
    const rawEntries = Object.entries(result.all_scores_by_name)
      .map(([k, v]) => [k, Number(v)])
      .filter(([, v]) => v > 1e-9)
      .sort((a, b) => b[1] - a[1]);
    if (rawEntries.length === 1) {
      onlyOne = true;
    } else if (rawEntries.length >= 2) {
      marginRaw = rawEntries[0][1] - rawEntries[1][1];
      runnerUp = rawEntries[1][0];
      const totalR = rawEntries.reduce((s, [, x]) => s + x, 0);
      if (totalR > 0) {
        marginShare = rawEntries[0][1] / totalR - rawEntries[1][1] / totalR;
      }
    }
  }
  return { share, marginRaw, marginShare, runnerUp, onlyOne: !!onlyOne };
}

export function scoreRowsForDisplay(result) {
  const names = result.all_scores_by_name || {};
  const sharesMap = result.score_shares_by_name;
  const categories = Object.keys(names);
  if (categories.length === 0) {
    return Object.entries(result.all_scores || {})
      .map(([cat, raw]) => ({
        category: cat,
        share: null,
        raw: Number(raw),
      }))
      .sort((a, b) => b.raw - a.raw);
  }
  const totalRaw = categories.reduce((s, k) => s + Number(names[k] ?? 0), 0);
  return categories
    .map((cat) => {
      let share = sharesMap?.[cat];
      if (share == null && totalRaw > 0) {
        share = Number(names[cat]) / totalRaw;
      }
      return {
        category: cat,
        share: share != null ? Number(share) : null,
        raw: Number(names[cat]),
      };
    })
    .sort((a, b) => b.raw - a.raw);
}
