/** Curated daily tips for Iron Log — keep each under ~100 characters. */
export const STATIC_TIPS: string[] = [
  // Training form
  'Brace your core before every heavy rep — pressure first, then pull or press.',
  'Control the eccentric. Slow lowers build more than bounced reps.',
  'Full range beats partials for most lifts. Own the bottom of the movement.',
  'Lock your scapulae before upper-body presses. Stable base, stronger press.',
  'Knees track over toes on squats. Don’t let them cave inward under load.',
  'Grip the bar hard. Tension in your hands transfers to the rest of the lift.',
  'Keep your ribs down on overhead work — don’t arch into the press.',
  'Hinge from the hips on deadlifts. The bar stays close to your legs.',
  'Pause at the sticking point once a week. Weak ranges grow under attention.',
  'Warm up with the pattern you’ll load. Don’t jump straight to working sets.',
  'Film one set this week. Form feedback beats guessing.',
  'Leave 1–2 reps in reserve on most sets. Progress without grinding every day.',

  // Progressive overload / programming
  'Add a rep or a small load when last week felt solid. Small steps compound.',
  'Log every set. The next session starts with last week’s numbers.',
  'Missed a session? Don’t double up — pick up where the plan left off.',
  'Consistency beats intensity spikes. Show up more often than you max out.',
  'Deload weeks aren’t weakness. They’re how you keep progressing for months.',

  // Recovery / sleep
  'Sleep is training too. Aim for a consistent bedtime most nights.',
  'Soreness isn’t always progress. Persistent joint pain means dial it back.',
  'Rest days still count. Recovery is part of the program.',
  'If yesterday crushed you, today can be lighter. Smart training lasts.',
  'Stretch after training, not instead of it. Mobility supports the work.',
  'Stress outside the gym taxes recovery. Protect sleep when life is heavy.',

  // Hydration / nutrition
  'Sip water through the day — don’t wait until you’re thirsty mid-set.',
  'Protein at each meal beats one huge shake at night.',
  'Eat enough to train hard. Underfueling stalls both strength and fat loss.',
  'Pre-workout carbs help hard sessions. Don’t train on empty if you crash.',
  'Hit your water goal before evening. Late catch-up wrecks sleep.',
  'Track one week honestly. Awareness beats perfect macros you invent.',
  'Vegetables aren’t optional filler — fiber keeps hard training sustainable.',
  'Salt your food if you sweat heavily. Electrolytes matter on long sessions.',

  // Mindset / consistency
  'Show up even when motivation is low. Discipline builds the streak.',
  'A short session logged beats a perfect session skipped.',
  'Compare yourself to last month, not to someone else’s highlight reel.',
  'Bad days still count if you train with intent. Adjust load, don’t quit.',
  'Write the next session before you leave. Tomorrow’s you will thank you.',
  'Ego lifts break progress. Leave a little in the tank and come back stronger.',
  'Your log doesn’t lie. Trust the data over how the mirror felt today.',
  'One muscle group neglected is a weak link. Rotate through the whole body.',
  'Warm-ups are not optional on heavy days. Earn the working sets.',
  'Finish the last set with the same focus as the first.',
  'Progress is noisy week to week. Zoom out to the monthly trend.',
  'If you’re always sore, you’re under-recovering — not under-working.',
  'Plan the week on Sunday. Unplanned weeks drift.',
  'Strength is patient work. Keep stacking clean sessions.',
  'Hydrate before caffeine if you train early. Start the day topped up.',
  'Walk more on rest days. Easy movement aids recovery.',
  'Protect your lower back: brace, hinge, and don’t yank with the arms.',
  'Breathe out through the hard part of the rep. Don’t hold forever.',
  'Celebrate logged workouts, not just PRs. Showing up is the base layer.',
];

export function pickStaticTip(seed = Date.now()): string {
  if (STATIC_TIPS.length === 0) return 'Show up. Log the work. Stack the days.';
  const index = Math.abs(seed) % STATIC_TIPS.length;
  return STATIC_TIPS[index]!;
}

export function dateSeed(date = new Date()): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}
