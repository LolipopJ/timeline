# Design

## Context

现有客户端以 URL 驱动时间线条件，在 `TimelineHome` 中以 SWR 分页查询。管理面板和条目来源菜单分别提供站点级和条目级操作。服务端的列表和计数共用 `getTimelineWhere` 生成来源、搜索和可见性条件，列表通过 serializer 返回共享 DTO。动机见 [提案](proposal.md)，行为见 [合集规格](specs/timeline-collections/spec.md)。

## Goals / Non-Goals

**Goals**

- 保持同一个条目 ID 和来源时间字段，分别管理内容及合集归属。
- 让合集条件在数据库中参与列表与总数计算，沿用静态客户端和服务端会话。

**Non-Goals**

首版合集树的管理操作限定为创建和更改父级。同级节点采用固定展示顺序，合集树的读权限从现有条目可见性推导。

## Decisions

### 树结构与直接归属

新增 `TimelineCollection`（`id`、`name`、`parent_id`）和 `TimelineItemCollection`（`timeline_item_id`、`collection_id`）。父级为自身表的外键，`null` 表示顶层合集。客户端把虚拟的「全部」放在顶层，对应请求省略 `collectionId`。归属表使用条目和合集的复合主键，并为按合集查条目及按父级查子节点提供索引。

拖动只更新被拖动节点的 `parent_id`。子节点继续引用原父节点，条目继续引用原合集 ID。闭包表可以预先存储祖先关系，跨父级移动时需要同步更新这批关系。父指针结构把写入集中在一行，并用 PostgreSQL 递归查询得到后代。移动事务先按树串行化，再检查节点、目标和目标祖先并提交更新，避免两个独立请求同时通过检查后形成循环。

编辑树保存一组直接选择的 ID，将祖先的勾选状态由该集合和当前树推导。管理员可以先直接选择父级，再加入其后代。移走后代时，直接选择的父级归属仍然有效。取消任一节点的勾选会从草稿移除该节点及后代的直接 ID。虚拟根在编辑器中是分组标题。

保存归属在同一事务内锁定目标条目，验证其仍可编辑并校验所选合集存在，再替换直接关系集合。空集合表示清除全部直接归属。关系写入独立于采集 upsert 和来源时间字段。条目软删除期间由查询排除，其关联行可供原条目恢复后继续使用。

### 接口与权限

共享契约使用 `CollectionNodeDto`（`id`、`name`、`parentId`）、`CollectionLabelDto`（`id`、`name`）和 `collectionIds` 编辑载荷。

| 接口 | 行为 |
| --- | --- |
| `GET /timeline-collections?view=…` | 返回当前有效视角可见的合集节点。管理员视角可读取完整树，公开视角从可见条目的直接归属向上保留祖先。 |
| `POST /timeline-collections` | 创建具名合集，接收 `name` 和 `parentId`。 |
| `PATCH /timeline-collections/:id/parent` | 接收 `parentId` 并移动子树。顶层用 `null`。 |
| `GET /timeline-items/:id/collections` | 为编辑器读取该条目的直接归属。 |
| `PATCH /timeline-items/:id/collections` | 接收 `collectionIds` 并保存完整直接归属集合。 |
| `GET /timeline-items`、`GET /timeline-items/count` | 接收同一个可选的 `collectionId`。列表 DTO 返回 `collectionLabels`。 |

合集创建、移动及单条归属读写纳入 `SENSITIVE_ROUTES`，使用现有 Cookie 会话校验及受限响应的 `private, no-store`。合集树读取也使用 `private, no-store`，通过与列表相同的有效视角及条目可见性判断公开范围。管理员编辑器单独读取直接归属，卡片使用面向展示的 DTO。

显式请求管理员视角而会话失效时，列表、计数、来源目录与合集树按公开视角响应，并附带可跨域读取的 `X-Timeline-View: public`。Axios 收到此标记会触发已有的认证失效事件，清除管理视角的列表、树和编辑状态。主动进入访客预览时保留管理员会话。

### 筛选与卡片投影

使用 TypeORM QueryBuilder 保留 `getTimelineWhere` 生成的条件，给列表与总数拼接同一套合集条件。递归查询从目标 ID 开始取该节点及后代，以 `EXISTS` 判断条目是否命中其中任一直接归属，保证排序、分页和计数处理的都是唯一条目。单条 ID 模式按规范优先应用 ID，省略 `collectionId` 时查询全部符合其他条件的条目。

列表取页后批量读取该页条目的直接归属，用树的祖先关系剔除也有已归属后代的父节点。serializer 只输出剩余节点的 `id` 和 `name`。这里将「叶子」定义为该条目归属路径的末端，直接加入一个全树中的父节点仍可在卡片上显示它。多条归属分别通过同一规则投影。

### 客户端入口与刷新

在 `AdminConsole` 复用现有标签、焦点和面板内滚动机制。客户端从扁平节点组装树，管理树用浏览器拖放指定目标父级，并提供共用同一保存操作的「移动到…」。在 `TimelineItemLabel` 增加管理员编辑入口和卡片标签。时间线工具区提供合集筛选，`timelineFilters.ts` 负责 URL 往返、条件比较和请求参数，并把折叠、编辑草稿留在各自的组件中。

`TimelineHome` 将合集 ID 纳入分页请求键，切换合集从第一页加载，返回已使用的合集筛选时会重新请求已加载的页。合集树和条目编辑请求使用现有认证与视角隔离，编辑器开启时读取当前直接归属。管理面板和条目菜单共享刷新回调，在写入成功后重新验证合集树和当前列表。当前合集在公开视角下不可用时，保留 URL，清除旧名称并提供清除筛选的操作。

## Risks / Trade-offs

- 并发移动可使单独合法的目标组合成循环 → 在 PostgreSQL 的事务范围内串行执行 reparent 校验和写入，并用并发场景验证。
- 一个条目可命中同一子树的多个合集 → 用 `EXISTS` 谓词匹配归属，以同一查询条件验证分页与总数。
- 合集归属及可见性变化会影响公开树 → 保存归属、设为公开或私密、软删除或恢复后刷新树和相关列表，沿用视角缓存隔离。

## Migration Plan

服务端按现有 TypeORM 数据源初始化流程创建合集及归属表。已有条目以未归类状态出现在「全部」，归属由管理员通过客户端开始配置。
