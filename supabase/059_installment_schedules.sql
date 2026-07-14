-- ============================================================
-- TimeFlow Migration 059: Gerçek taksit planı ve vadeler
-- ============================================================
-- Her vade ayrı satırdır; tahsilat yine payments tablosunda kalır ve
-- installment_id ile ilgili vadeye bağlanır. Böylece kasa/ciro tek kaynaktan
-- beslenirken taksit tarihi, sırası, kısmi ödeme ve gecikme izlenebilir.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.treatment_installments (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id       UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    treatment_plan_id UUID          NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    sequence_no       INTEGER       NOT NULL CHECK (sequence_no > 0),
    due_date          DATE          NOT NULL,
    amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (treatment_plan_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_treatment_installments_plan
    ON public.treatment_installments(treatment_plan_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_treatment_installments_customer_due
    ON public.treatment_installments(customer_id, due_date);
CREATE INDEX IF NOT EXISTS idx_treatment_installments_org_due
    ON public.treatment_installments(organization_id, due_date);

ALTER TABLE public.treatment_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treatment_installments_org_access" ON public.treatment_installments;
CREATE POLICY "treatment_installments_org_access" ON public.treatment_installments
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS installment_id UUID
        REFERENCES public.treatment_installments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_installment
    ON public.payments(installment_id) WHERE installment_id IS NOT NULL;

-- Vade satırı başka bir organizasyonun/hastanın planına bağlanamasın.
CREATE OR REPLACE FUNCTION public.validate_treatment_installment_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    plan_org UUID;
    plan_customer UUID;
BEGIN
    SELECT organization_id, customer_id
      INTO plan_org, plan_customer
      FROM public.treatment_plans
     WHERE id = NEW.treatment_plan_id;

    IF plan_org IS NULL
       OR plan_org IS DISTINCT FROM NEW.organization_id
       OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'installment_plan_scope_mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_treatment_installment_scope ON public.treatment_installments;
CREATE TRIGGER trg_validate_treatment_installment_scope
    BEFORE INSERT OR UPDATE OF organization_id, customer_id, treatment_plan_id
    ON public.treatment_installments
    FOR EACH ROW EXECUTE FUNCTION public.validate_treatment_installment_scope();

-- Aynı vadeye paralel iki cihazdan ödeme alınsa bile vade tutarı aşılmasın.
-- Vade satırındaki FOR UPDATE kilidi, ilgili tahsilatları seri hale getirir.
CREATE OR REPLACE FUNCTION public.validate_installment_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    installment_amount NUMERIC(10,2);
    installment_plan UUID;
    installment_org UUID;
    installment_customer UUID;
    already_paid NUMERIC(10,2);
BEGIN
    IF NEW.installment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT amount, treatment_plan_id, organization_id, customer_id
      INTO installment_amount, installment_plan, installment_org, installment_customer
      FROM public.treatment_installments
     WHERE id = NEW.installment_id
     FOR UPDATE;

    IF installment_amount IS NULL THEN
        RAISE EXCEPTION 'installment_not_found' USING ERRCODE = '23503';
    END IF;

    IF NEW.treatment_plan_id IS DISTINCT FROM installment_plan
       OR NEW.organization_id IS DISTINCT FROM installment_org
       OR NEW.customer_id IS DISTINCT FROM installment_customer THEN
        RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(amount), 0)
      INTO already_paid
      FROM public.payments
     WHERE installment_id = NEW.installment_id
       AND id IS DISTINCT FROM NEW.id;

    IF already_paid + NEW.amount > installment_amount THEN
        RAISE EXCEPTION 'installment_payment_exceeds_balance' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_installment_payment ON public.payments;
CREATE TRIGGER trg_validate_installment_payment
    BEFORE INSERT OR UPDATE OF installment_id, treatment_plan_id, organization_id, customer_id, amount
    ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.validate_installment_payment();

COMMIT;

NOTIFY pgrst, 'reload schema';
