# Spec Delta

## MODIFIED Requirements

### Requirement: URL 是时间线筛选状态的唯一来源

客户端 SHALL 从 URL 的 `search`、`orderBy` 与 `collectionId` 参数初始化筛选状态，并在筛选状态变化后把相同的状态写回 URL。选择或清除合集 MUST 立即更新 URL。选择根节点 SHALL 从 URL 移除 `collectionId`。刷新页面、直接打开链接、浏览器后退与前进 MUST 恢复链接所描述的结果集与排序。未知参数 MUST NOT 影响结果，默认排序 MUST 在 URL 缺省 `orderBy` 时生效。

#### Scenario: 后退到上一个筛选结果
- **WHEN** 读者先搜索「旅行」再改为搜索「读书」，然后按下浏览器后退
- **THEN** 页面恢复到「旅行」的结果集，搜索框与 URL 同时显示该条件

#### Scenario: 直接打开带条件的链接
- **WHEN** 读者打开一个包含 `search` 与 `orderBy=updated_at` 的链接
- **THEN** 首屏按更新时间排序并只显示匹配该条件的内容，搜索框显示对应条件

#### Scenario: 分享包含合集的筛选结果
- **WHEN** 读者在带有关键词与排序的时间线中选择一个合集，然后刷新页面或直接打开该 URL
- **THEN** 页面恢复该合集选择、关键词和排序，并显示满足全部条件的可见条目

### Requirement: ID 条件与其他条件互斥

`id:` 条件 SHALL 与关键词、`type:` 和合集条件互斥。写入 ID 条件时客户端 MUST 清空关键词、类型和合集条件。写入关键词、类型或非根合集条件时，客户端 MUST 清除 ID 条件。合法的单条 ID 与合集参数同时出现在输入时，客户端从 URL 恢复以及服务端查询列表和总数 SHALL 优先应用 ID 条件。同一时刻 MUST 至多存在一个 ID 条件。

#### Scenario: 从 ID 结果回到关键词搜索
- **WHEN** 读者正查看某条时间线项的 ID 结果，然后在搜索框输入关键词
- **THEN** ID 条件被移除，列表按关键词重新加载

#### Scenario: 在关键词搜索中打开分享链接
- **WHEN** 读者已有关键词条件，然后打开一个只含 ID 条件的链接
- **THEN** 关键词条件不再生效，页面只显示链接指定的那一条时间线项

#### Scenario: 从单条分享结果切换为合集
- **WHEN** 读者在单条时间线项的 ID 结果中选择一个非根合集
- **THEN** URL 清除 ID 条件并写入合集 ID，列表改为按合集查询

#### Scenario: 打开同时含条目 ID 和合集 ID 的链接
- **WHEN** 读者打开同时包含合法的单条条目 ID 与合集 ID 的链接，且该条目可见但不在该合集中
- **THEN** 页面仍显示该单条条目，列表和总数按 ID 条件查询
