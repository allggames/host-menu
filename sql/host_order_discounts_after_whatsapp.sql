-- HOST: descuentos manuales sobre pedidos iniciados por WhatsApp.
-- El total previo se conserva para poder reemplazar o quitar el descuento.
CREATE TABLE IF NOT EXISTS public.host_order_discounts (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  original_total numeric(12,2) NOT NULL CHECK (original_total >= 0),
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount > 0),
  discounted_total numeric(12,2) NOT NULL CHECK (discounted_total >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.host_order_discount_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('apply', 'remove')),
  previous_total numeric(12,2) NOT NULL CHECK (previous_total >= 0),
  new_total numeric(12,2) NOT NULL CHECK (new_total >= 0),
  discount_type text,
  discount_value numeric(12,2),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE public.host_order_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_order_discount_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.host_order_discounts FROM PUBLIC, anon;
REVOKE ALL ON public.host_order_discount_events FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.host_order_discounts TO authenticated;
GRANT SELECT, INSERT ON public.host_order_discount_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.host_order_discount_events_id_seq TO authenticated;

CREATE POLICY "host order discounts admin select"
ON public.host_order_discounts FOR SELECT TO authenticated
USING ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2');
CREATE POLICY "host order discounts admin insert"
ON public.host_order_discounts FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2' AND updated_by = (SELECT auth.uid()));
CREATE POLICY "host order discounts admin update"
ON public.host_order_discounts FOR UPDATE TO authenticated
USING ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2')
WITH CHECK ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2' AND updated_by = (SELECT auth.uid()));
CREATE POLICY "host order discounts admin delete"
ON public.host_order_discounts FOR DELETE TO authenticated
USING ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2');
CREATE POLICY "host order discount events admin select"
ON public.host_order_discount_events FOR SELECT TO authenticated
USING ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2');
CREATE POLICY "host order discount events admin insert"
ON public.host_order_discount_events FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_host_admin()) AND (SELECT auth.jwt()->>'aal') = 'aal2' AND changed_by = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.host_admin_set_order_discount(
  p_order_id uuid,
  p_type text,
  p_value numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_saved public.host_order_discounts%ROWTYPE;
  v_base numeric(12,2);
  v_discount numeric(12,2);
  v_final numeric(12,2);
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT public.is_host_admin()
     OR coalesce((SELECT auth.jwt()->>'aal'),'') <> 'aal2' THEN
    RAISE EXCEPTION 'Solo administradores con doble autenticación pueden editar descuentos';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Seleccioná un pedido válido';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el pedido'; END IF;
  IF v_order.status IN ('cancelado','entregado') THEN
    RAISE EXCEPTION 'Solo se pueden modificar descuentos antes de entregar o cancelar el pedido';
  END IF;

  SELECT * INTO v_saved FROM public.host_order_discounts
  WHERE order_id = p_order_id FOR UPDATE;
  IF v_saved.order_id IS NOT NULL AND v_order.total <> v_saved.discounted_total THEN
    RAISE EXCEPTION 'El total del pedido cambió. Revisalo antes de volver a aplicar un descuento';
  END IF;
  v_base := coalesce(v_saved.original_total, v_order.total);

  IF p_type = 'none' THEN
    IF v_saved.order_id IS NULL THEN
      RAISE EXCEPTION 'El pedido no tiene un descuento manual';
    END IF;
    UPDATE public.orders SET total = v_base WHERE id = p_order_id;
    DELETE FROM public.host_order_discounts WHERE order_id = p_order_id;
    INSERT INTO public.host_order_discount_events(
      order_id,action,previous_total,new_total,discount_amount,changed_by
    ) VALUES(p_order_id,'remove',v_order.total,v_base,0,v_actor);
    RETURN jsonb_build_object('original_total',v_base,'discount_amount',0,'total',v_base,'removed',true);
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('percent','amount') THEN
    RAISE EXCEPTION 'Elegí porcentaje o monto fijo';
  END IF;
  IF p_value IS NULL OR p_value::text IN ('NaN','Infinity','-Infinity') OR v_base <= 0 THEN
    RAISE EXCEPTION 'Ingresá un descuento válido para un pedido con importe positivo';
  END IF;

  IF p_type = 'percent' THEN
    IF p_value < 1 OR p_value > 100 OR p_value <> trunc(p_value) THEN
      RAISE EXCEPTION 'El porcentaje debe ser un número entero entre 1 y 100';
    END IF;
    v_discount := round(v_base * p_value / 100, 2);
  ELSE
    IF p_value < 1 OR p_value > v_base OR p_value <> round(p_value,2) THEN
      RAISE EXCEPTION 'El descuento fijo debe ser mayor a 0 y no superar el total';
    END IF;
    v_discount := p_value;
  END IF;

  v_final := v_base - v_discount;
  UPDATE public.orders SET total = v_final WHERE id = p_order_id;
  INSERT INTO public.host_order_discounts (
    order_id,original_total,discount_type,discount_value,discount_amount,
    discounted_total,updated_at,updated_by
  ) VALUES (
    p_order_id,v_base,p_type,p_value,v_discount,v_final,now(),v_actor
  )
  ON CONFLICT (order_id) DO UPDATE SET
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    discount_amount = EXCLUDED.discount_amount,
    discounted_total = EXCLUDED.discounted_total,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

  INSERT INTO public.host_order_discount_events (
    order_id,action,previous_total,new_total,discount_type,
    discount_value,discount_amount,changed_by
  ) VALUES (
    p_order_id,'apply',v_order.total,v_final,p_type,p_value,v_discount,v_actor
  );
  RETURN jsonb_build_object('original_total',v_base,'discount_amount',v_discount,'total',v_final,'removed',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.host_admin_set_order_discount(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_admin_set_order_discount(uuid,text,numeric) TO authenticated;