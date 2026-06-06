


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."htt_now"() RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    AS $$ select now(); $$;


ALTER FUNCTION "public"."htt_now"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."htt_room_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "player_id" "text" NOT NULL,
    "player_name" "text" NOT NULL,
    "is_host" boolean DEFAULT false NOT NULL,
    "ready" boolean DEFAULT true NOT NULL,
    "is_banned" boolean DEFAULT false NOT NULL,
    "is_online" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."htt_room_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."htt_room_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "round_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "player_id" "text" NOT NULL,
    "player_name" "text" NOT NULL,
    "score" numeric(6,1) NOT NULL,
    "consistency_score" numeric(6,1) NOT NULL,
    "accuracy_score" numeric(6,1) NOT NULL,
    "analysis" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."htt_room_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."htt_room_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "beat_id" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "htt_room_rounds_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."htt_room_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."htt_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "beat_id" "text" NOT NULL,
    "silent_bars" integer NOT NULL,
    "phase" "text" DEFAULT 'lobby'::"text" NOT NULL,
    "current_round" integer DEFAULT 0 NOT NULL,
    "total_rounds" integer DEFAULT 5 NOT NULL,
    "current_beat_id" "text",
    "active_round_id" "uuid",
    "locked_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "round_starts_at" timestamp with time zone,
    CONSTRAINT "htt_rooms_mode_check" CHECK (("mode" = ANY (ARRAY['local'::"text", 'online'::"text"]))),
    CONSTRAINT "htt_rooms_phase_check" CHECK (("phase" = ANY (ARRAY['lobby'::"text", 'running'::"text", 'round_result'::"text", 'final'::"text", 'sync_failed'::"text"]))),
    CONSTRAINT "htt_rooms_silent_bars_check" CHECK ((("silent_bars" >= 1) AND ("silent_bars" <= 16)))
);


ALTER TABLE "public"."htt_rooms" OWNER TO "postgres";


ALTER TABLE ONLY "public"."htt_room_players"
    ADD CONSTRAINT "htt_room_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."htt_room_players"
    ADD CONSTRAINT "htt_room_players_room_id_player_id_key" UNIQUE ("room_id", "player_id");



ALTER TABLE ONLY "public"."htt_room_results"
    ADD CONSTRAINT "htt_room_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."htt_room_results"
    ADD CONSTRAINT "htt_room_results_room_id_round_number_player_id_key" UNIQUE ("room_id", "round_number", "player_id");



ALTER TABLE ONLY "public"."htt_room_rounds"
    ADD CONSTRAINT "htt_room_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."htt_room_rounds"
    ADD CONSTRAINT "htt_room_rounds_room_id_round_number_key" UNIQUE ("room_id", "round_number");



ALTER TABLE ONLY "public"."htt_rooms"
    ADD CONSTRAINT "htt_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."htt_rooms"
    ADD CONSTRAINT "htt_rooms_token_key" UNIQUE ("token");



CREATE INDEX "idx_htt_room_players_banned" ON "public"."htt_room_players" USING "btree" ("room_id", "is_banned");



CREATE INDEX "idx_htt_room_players_room_id" ON "public"."htt_room_players" USING "btree" ("room_id");



CREATE INDEX "idx_htt_room_results_room_round" ON "public"."htt_room_results" USING "btree" ("room_id", "round_number");



CREATE INDEX "idx_htt_room_rounds_room_id" ON "public"."htt_room_rounds" USING "btree" ("room_id");



CREATE INDEX "idx_htt_rooms_token" ON "public"."htt_rooms" USING "btree" ("token");



ALTER TABLE ONLY "public"."htt_room_players"
    ADD CONSTRAINT "htt_room_players_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."htt_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."htt_room_results"
    ADD CONSTRAINT "htt_room_results_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."htt_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."htt_room_results"
    ADD CONSTRAINT "htt_room_results_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."htt_room_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."htt_room_rounds"
    ADD CONSTRAINT "htt_room_rounds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."htt_rooms"("id") ON DELETE CASCADE;



ALTER TABLE "public"."htt_room_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."htt_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "players_delete_all" ON "public"."htt_room_players" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "players_insert_all" ON "public"."htt_room_players" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "players_select_all" ON "public"."htt_room_players" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "players_update_all" ON "public"."htt_room_players" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "results_delete_all" ON "public"."htt_room_results" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "results_insert_all" ON "public"."htt_room_results" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "results_select_all" ON "public"."htt_room_results" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "results_update_all" ON "public"."htt_room_results" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "rooms_insert_all" ON "public"."htt_rooms" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "rooms_select_all" ON "public"."htt_rooms" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "rooms_update_all" ON "public"."htt_rooms" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "rounds_insert_all" ON "public"."htt_room_rounds" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "rounds_select_all" ON "public"."htt_room_rounds" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "rounds_update_all" ON "public"."htt_room_rounds" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";



GRANT ALL ON FUNCTION "public"."htt_now"() TO "anon";
GRANT ALL ON FUNCTION "public"."htt_now"() TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_room_players" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_room_players" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_room_results" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_room_results" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_room_rounds" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_room_rounds" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_rooms" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."htt_rooms" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,USAGE ON SEQUENCES TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";




