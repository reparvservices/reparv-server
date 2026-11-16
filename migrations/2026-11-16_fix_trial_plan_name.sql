-- Fix the "Free Trail" typo shown to partners. Safe to run more than once.
UPDATE subscription_plans
SET plan_name = 'Free Trial'
WHERE plan_name = 'Free Trail' AND plan_type = 'trial';

-- NOT changed here (business decision): the trial plan's `duration` is in DAYS and the
-- current value is 365, i.e. a full year of free access. To make it e.g. a 14-day trial:
--   UPDATE subscription_plans SET duration = 14 WHERE plan_type = 'trial' AND role = 'project';
