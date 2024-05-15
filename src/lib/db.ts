import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

interface CategoryInfos {
  name: string;
  description?: string;
}

interface AnnotationInfos {
  title: string;
  text?: string;
  file?: string;
}

interface Annotation extends AnnotationInfos {
  id: number;
  last_modify: Date;
  create_at: Date;
  line_num: number;
  categories?: [
    {
      id: number;
      name: string;
      description?: string;
    }
  ];
}

let db: Database;

export async function init() {
  if (db) return;

  const config = await invoke<{ db_url: string }>("get_config");
  db = await Database.load(config.db_url);
}

export async function createAnnotation(annotation: AnnotationInfos) {
  console.log("Save test!")
  if (!annotation.title) throw new Error("No title has provided to annotation");
  const { title, file, text } = annotation;

  if (file && typeof file !== "string") {
    throw new Error("File must be a string");
  }

  if (text && typeof text !== "string") {
    throw new Error("Text must be a string");
  }

  const query =
    "INSERT INTO annotations (title, file, text) VALUES ($1, $2, $3)";

  await db.execute(query, [title, file, text]);

  return true;
}

export async function createCategory(category: CategoryInfos) {
  if (!category?.name) throw new Error("No name has provided to category");
  const { name, description } = category;

  const query = "INSERT INTO categories (name, description) VALUES ($1, $2)";

  await db.execute(query, [name, description]);

  return true;
}

export function addCategory(annotationId: number, categoryId: number) {
  if (!annotationId || !Number.isInteger(annotationId) || annotationId <= 0) {
    throw new Error("annotationId must be a positive integer");
  }
  if (!categoryId || !Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error("categoryId must be a positive integer");
  }

  const query = `INSERT INTO annotations_categories (annotation_id, category_id) VALUES ($1, $2);`;
  return db.execute(query, [annotationId, categoryId]);
}

export async function getAnnotations(page: number = 1, limit: number = 10) {
  if (page <= 0 || limit <= 0) {
    throw new Error("Page and limit must be positive integers");
  }

  const query = `
  WITH AnnotationsNumeradas AS (
    SELECT 
      a.id,
      a.title,
      a.text,
      a.file,
      a.last_modify,
      a.create_at,
      JSON_GROUP_ARRAY(
        JSON_OBJECT(
          'id', c.id,
          'name', c.name,
          'description', c.description
        )
      ) as categories,
      ROW_NUMBER() OVER (ORDER BY a.last_modify DESC) as line_num
    FROM annotations a
    LEFT JOIN annotations_categories ac ON a.id = ac.annotation_id
    LEFT JOIN categories c ON ac.category_id = c.id
    GROUP BY a.id, a.title, a.text, a.file, a.last_modify, a.create_at
  )
  SELECT *
  FROM AnnotationsNumeradas
  WHERE line_num BETWEEN $1 AND $2;`;

  const start = page > 1 ? page * limit : page;
  const end = start + limit;

  return db.select<Annotation[]>(query, [start, end]);
}
