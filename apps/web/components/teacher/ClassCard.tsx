import Link from "next/link";

export interface ClassInfo {
  id: string;
  name: string;
  studentCount: number;
  createdAt: string;
}

export function ClassCard({ cls }: { cls: ClassInfo }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
          {cls.name}
        </div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          {cls.studentCount} student{cls.studentCount !== 1 ? "s" : ""}
          {" · "}
          Created {new Date(cls.createdAt).toLocaleDateString()}
        </div>
      </div>
      <Link
        href={`/class/${cls.id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: "#7c3aed",
          textDecoration: "none",
        }}
      >
        View class →
      </Link>
    </div>
  );
}
