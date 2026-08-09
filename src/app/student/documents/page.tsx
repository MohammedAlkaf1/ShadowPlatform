import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadForm } from "./upload-form";
import { FileText } from "lucide-react";

export default async function StudentDocumentsPage() {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("StudentDocuments");
  const tDocumentStatus = await getTranslations("Common.documentStatus");
  const locale = await getLocale();

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
  });

  const documents = studentProfile
    ? await db.document.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, originalFilename: true, createdAt: true, status: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("uploadTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("myDocumentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noDocuments")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableFile")}</TableHead>
                  <TableHead>{t("tableUploadDate")}</TableHead>
                  <TableHead>{t("tableStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <FileText className="size-4 text-muted-foreground" />
                      {doc.originalFilename}
                    </TableCell>
                    <TableCell dir="ltr" className="text-end text-muted-foreground">
                      {formatDate(doc.createdAt, locale)}
                    </TableCell>
                    <TableCell>{tDocumentStatus(doc.status === "reviewed" ? "reviewed" : "pending")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
