import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-secondary px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-primary">غير مصرح بالوصول</h1>
      <p className="max-w-md text-muted-foreground">
        لا تملك الصلاحية اللازمة لعرض هذه الصفحة. إذا كنت تعتقد أن هذا خطأ، تواصل مع مسؤول النظام.
      </p>
      <Button render={<Link href="/">العودة للصفحة الرئيسية</Link>} />
    </div>
  );
}
