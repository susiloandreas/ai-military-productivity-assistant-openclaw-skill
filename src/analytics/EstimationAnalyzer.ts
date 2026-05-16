import { Mission, EstimationAnalysis } from '../types';

/**
 * Analyses how accurately a user estimates mission duration.
 * bias = 'underestimator' → consistently runs over ETA (actual > eta)
 * bias = 'overestimator'  → consistently finishes early  (actual < eta)
 */
export function analyzeEstimations(missions: Mission[]): EstimationAnalysis {
  const measurable = missions.filter(
    m => m.eta_minutes != null && m.actual_duration_minutes != null
  );

  if (measurable.length === 0) {
    return { sampleCount: 0, avgAccuracyPct: 100, avgOverageMinutes: 0, bias: 'on-target' };
  }

  const overages = measurable.map(m => m.actual_duration_minutes! - m.eta_minutes!);
  const avgOverage = overages.reduce((a, b) => a + b, 0) / overages.length;

  // Accuracy: 100 = perfect, penalised proportionally to deviation from ETA
  const accuracyScores = measurable.map(m => {
    const ratio = m.actual_duration_minutes! / m.eta_minutes!;
    return Math.max(0, 100 - Math.abs(ratio - 1) * 100);
  });
  const avgAccuracyPct = Math.round(
    accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length
  );

  let bias: EstimationAnalysis['bias'] = 'on-target';
  if (avgOverage > 10) bias = 'underestimator'; // habitually runs over
  if (avgOverage < -10) bias = 'overestimator'; // habitually finishes early

  return {
    sampleCount: measurable.length,
    avgAccuracyPct,
    avgOverageMinutes: Math.round(avgOverage),
    bias,
  };
}
