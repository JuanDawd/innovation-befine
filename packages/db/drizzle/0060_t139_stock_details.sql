DROP INDEX "idx_stock_movements_item";--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD COLUMN "details_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "details_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "details_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_stock_movements_item" ON "stock_movements" USING btree ("cloth_piece_variant_id","size_id","color_id","details_key");