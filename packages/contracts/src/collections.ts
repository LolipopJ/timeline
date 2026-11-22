export const UNCATEGORIZED_COLLECTION_ID = "uncategorized";

export interface CollectionLabelDto {
  id: string;
  name: string;
}

export interface CollectionNodeDto extends CollectionLabelDto {
  parentId: string | null;
  itemCount: number;
}

export interface CollectionTreeDto {
  totalCount: number;
  uncategorizedCount: number;
  nodes: CollectionNodeDto[];
}

export interface CreateCollectionParams {
  name: string;
  parentId: string | null;
}

export interface RenameCollectionParams {
  name: string;
}

export interface MoveCollectionParams {
  parentId: string | null;
}

export interface MergeCollectionParams {
  targetId: string | null;
}

export interface ItemCollectionsDto {
  collectionIds: string[];
}

export interface BatchItemCollectionChange {
  action: "add-collections" | "remove-collections";
  collectionIds: string[];
}
