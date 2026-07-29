-- ════════════════════════════════════════════════════════════════
-- Administración: quitar de la lista de acceso
-- ════════════════════════════════════════════════════════════════

-- La regla 2 —"nada se borra"— es sobre el acervo: un documento o una
-- versión no desaparecen nunca, pasan a archivado. La lista de acceso no
-- es acervo, es configuración: si alguien deja la CAA, su correo tiene que
-- poder salir de la lista, y dejarlo ahí "por no borrar" sería guardar una
-- puerta abierta por prolijidad mal entendida.
--
-- La política `access_list_admin` ya cubre todas las operaciones; lo que
-- faltaba era el permiso de tabla, que es la otra mitad (RLS filtra filas,
-- el GRANT da acceso a la tabla, y hacen falta las dos).
--
-- Sigue sin otorgarse `delete` sobre documents, versions ni sus tablas
-- satélite, y así tiene que seguir.
grant delete on public.access_list to authenticated;
