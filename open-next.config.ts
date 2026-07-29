import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * Adaptador de Next para Cloudflare Workers.
 *
 * Configuración deliberadamente mínima: esta aplicación no usa ISR ni
 * caché de datos —todas las páginas leen de Supabase con la sesión del
 * usuario y se renderizan a demanda—, así que no hace falta declarar
 * ningún almacén de caché incremental. Agregarlo "por si acaso" traería
 * un KV que mantener y una fuente más de datos viejos en pantalla, que en
 * un repositorio cuya promesa es "siempre sabes cuál es la versión buena"
 * sería contradecirse en la infraestructura.
 */
export default defineCloudflareConfig()
