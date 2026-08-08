-- Make the first annual choices public by default.
-- Platform Operations can still turn any duration off or change its discount.

update platform_billing_variants
set is_active = true,
    updated_at = now()
where billing_unit = 'year'
  and interval_count in (1, 2, 3);
