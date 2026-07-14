-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BOX',
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 320,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 180,
    "text" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#f97316',
    "fontSize" INTEGER NOT NULL DEFAULT 14,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Annotation_mapId_idx" ON "Annotation"("mapId");
