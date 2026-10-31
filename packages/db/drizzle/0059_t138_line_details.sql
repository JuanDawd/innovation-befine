CREATE TABLE "pedido_line_details" (
	"line_id" uuid NOT NULL,
	"detail_id" uuid NOT NULL,
	"value_id" uuid,
	"value_other" text,
	CONSTRAINT "pedido_line_details_line_id_detail_id_pk" PRIMARY KEY("line_id","detail_id"),
	CONSTRAINT "chk_pedido_line_details_value" CHECK (("pedido_line_details"."value_id" IS NULL) <> ("pedido_line_details"."value_other" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "pedido_line_details" ADD CONSTRAINT "pedido_line_details_line_id_pedido_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."pedido_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_line_details" ADD CONSTRAINT "pedido_line_details_detail_id_details_id_fk" FOREIGN KEY ("detail_id") REFERENCES "public"."details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_line_details" ADD CONSTRAINT "pedido_line_details_value_id_detail_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."detail_values"("id") ON DELETE restrict ON UPDATE no action;