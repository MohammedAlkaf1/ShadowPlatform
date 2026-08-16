import { redirect } from "next/navigation";

/**
 * Batch 3: assess + plan merged into one "مراجعة وثيقة" review screen.
 * This route is kept only as a redirect so any stale bookmark/deep link
 * still lands somewhere useful, rather than 404ing outright. All in-app
 * links now point directly at /review (see specialist/queue/page.tsx and
 * specialist/students/[id]/page.tsx).
 */
export default async function AssessRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/specialist/students/${id}/review`);
}
