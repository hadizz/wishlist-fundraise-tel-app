CREATE TYPE "public"."bot_chat_status" AS ENUM('member', 'administrator', 'left', 'kicked');--> statement-breakpoint
CREATE TYPE "public"."contribution_method" AS ENUM('stars', 'manual');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pending', 'awaiting_confirmation', 'confirmed', 'rejected', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."follow_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."group_session_status" AS ENUM('voting', 'open', 'completed', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'funded', 'purchased', 'archived');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'premium');--> statement-breakpoint
CREATE TYPE "public"."wishlist_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"group_session_id" uuid,
	"method" "contribution_method" NOT NULL,
	"status" "contribution_status" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"stars_amount" integer,
	"stars_rate" real,
	"message" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"telegram_payment_charge_id" text,
	"provider_payment_charge_id" text,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_amount_positive" CHECK ("contributions"."amount_minor" > 0),
	CONSTRAINT "contributions_stars_fields" CHECK (("contributions"."method" = 'stars') = ("contributions"."stars_amount" is not null))
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"status" "follow_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_no_self" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
CREATE TABLE "group_session_votes" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_session_votes_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"beneficiary_id" uuid NOT NULL,
	"candidate_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"product_id" uuid,
	"created_by_id" uuid NOT NULL,
	"status" "group_session_status" DEFAULT 'voting' NOT NULL,
	"progress_message_id" integer,
	"deadline_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_sessions_open_has_product" CHECK ("group_sessions"."status" = 'voting' or "group_sessions"."status" = 'cancelled' or "group_sessions"."product_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"chat_id" bigint,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_has_target" CHECK ("notification_outbox"."user_id" is not null or "notification_outbox"."chat_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"image_url" text,
	"price_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"funded_minor" bigint DEFAULT 0 NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"funded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price_minor" > 0),
	CONSTRAINT "products_funded_nonneg" CHECK ("products"."funded_minor" >= 0),
	CONSTRAINT "products_title_len" CHECK (char_length("products"."title") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "subscription_plan" DEFAULT 'free' NOT NULL,
	"expires_at" timestamp with time zone,
	"telegram_payment_charge_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"bot_status" "bot_chat_status" NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"language_code" text,
	"photo_url" text,
	"bio" text,
	"auto_accept_follows" boolean DEFAULT false NOT NULL,
	"can_dm" boolean DEFAULT false NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"default_currency" char(3) DEFAULT 'USD' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"emoji" text,
	"visibility" "wishlist_visibility" DEFAULT 'public' NOT NULL,
	"event_date" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_title_len" CHECK (char_length("wishlists"."title") between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_group_session_id_group_sessions_id_fk" FOREIGN KEY ("group_session_id") REFERENCES "public"."group_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_votes" ADD CONSTRAINT "group_session_votes_session_id_group_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."group_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_votes" ADD CONSTRAINT "group_session_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_votes" ADD CONSTRAINT "group_session_votes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_telegram_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_beneficiary_id_users_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_tg_charge_uq" ON "contributions" USING btree ("telegram_payment_charge_id");--> statement-breakpoint
CREATE INDEX "contributions_product_status_idx" ON "contributions" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "contributions_contributor_idx" ON "contributions" USING btree ("contributor_id","created_at");--> statement-breakpoint
CREATE INDEX "contributions_session_idx" ON "contributions" USING btree ("group_session_id");--> statement-breakpoint
CREATE INDEX "follows_followee_status_idx" ON "follows" USING btree ("followee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "group_sessions_one_active_per_chat_uq" ON "group_sessions" USING btree ("telegram_chat_id") WHERE "group_sessions"."status" in ('voting', 'open');--> statement-breakpoint
CREATE INDEX "group_sessions_product_idx" ON "group_sessions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_pending_dedupe_uq" ON "notification_outbox" USING btree ("dedupe_key") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "products_wishlist_idx" ON "products" USING btree ("wishlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tg_charge_uq" ON "subscriptions" USING btree ("telegram_payment_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_uq" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "wishlists_owner_idx" ON "wishlists" USING btree ("owner_id","position");