---
title: 使用 ClickHouse 中遇到的坑
category: Debug
tags: [数据库, debug]
date: 2025-08-29 10:00:00
updated: 2025-08-29 10:00:00
---
最近在写一个Java项目，需要操作到 ClickHouse 数据库，手写 SQL 完成各种操作。在这中间遇到不少 bug，此处记录一下解决方法。

## 批量插入操作

### 问题描述

在批量插入操作中，出现如下报错：

> 信息经脱敏处理

```YAML
ru.yandex.clickhouse.except.ClickHouseException: ClickHouse exception, code: 27, host: [HOST_IP], port: 8123; Code: 27, e.displayText() = DB::ParsingException: Cannot parse input: expected '\t' before: '[TASK_ID]\t[QUERY_TEXT]\t[ACCOUNT_ID]\t[USER_ID]\t{"startRow":1,"sheet":0,"queryType":"TEXT_ROW": 
Row 1:
Column 0,   name: task_id,     type: String,                         parsed text: "[TASK_ID]"
Column 1,   name: query,       type: String,                         parsed text: "[QUERY_TEXT]"
Column 2,   name: account_id,  type: String,                         parsed text: "[ACCOUNT_ID]"
Column 3,   name: user_id,     type: String,                         parsed text: "[USER_ID]"
Column 4,   name: others,      type: String,                         parsed text: "{<DOUBLE QUOTE>startRow<DOUBLE QUOTE>:0,<DOUBLE QUOTE>sheet<DOUBLE QUOTE>:0,<DOUBLE QUOTE>queryType<DOUBLE QUOTE>:<DOUBLE QUOTE>TEXT_ROW<DOUBLE QUOTE>}"
Column 5,   name: create_time, type: DateTime64(3, 'Asia/Shanghai'), parsed text: "[PARSED_CREATE_TIME]"
ERROR: garbage after DateTime64(3, 'Asia/Shanghai'): "[TASK_ID_FRAGMENT]"
```

### 问题定位

通过以上内容发现：Column 5 错误的接收了 Column 4 的部分内容。

其中，`others` 列以字符串类型存储复杂 JSON 参数，可能是其中的`\t`、`\n` 等符号导致失败。

经排查，了解到 ClickHouse JDBC 在批量插入时，会将参数序列化为类似 TSV 的格式。TSV 插入是按 `\t` 列分隔、`\n` 行分隔解析的。JSON 字符串里包含这些符号会导致解析错位，并且即使使用`\`转义，问题依旧存在。

使用 `PreparedStatement.setString(index, json);`不会把 TSV 整行拼成一个字符串写入，JDBC 会按列安全写入，包括 JSON 内的 Tab、换行。理论上可以解决此问题。

但是代码中使用`PreparedStatement`按列绑定，问题依旧存在。这时候再看操作数据库等部分：

```Java
BATCH_INSERT_SQL = "INSERT INTO xxx
(task_id, query, account_id, user_id, others, create_time, update_time)
VALUES (?, ?, ?, ?, ?, now64(3), now64(3))"

PreparedStatement statement = connection.prepareStatement(BATCH_INSERT_SQL);
statement.setString()
...
```

问题的根源是 ClickHouse 官方 JDBC 并不完全支持 混合 `?` 参数 + 函数表达式`now64(3)` 的 `INSERT VALUES` 写法，在解析过程中很可能拼成了一行，导致`others` 内 JSON 包含的特殊字符破坏了列边界，导致后面的 create_time 列解析失败。

### 解决方法

全部使用 `?` 占位符，利用 JDBC 绑定：

```Java
private static final String BATCH_INSERT_SQL = "INSERT INTO xxx" +
        "(task_id, query, account_id, user_id, others, create_time, update_time) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)";

...

for (Task task : tasks) {
    statement.setString(index, xxx);
    ...
    statement.addBatch();
}
```

ClickHouse 中时间格式为 `DateTime64(3,'Asia/Shanghai')`，使用以下 Java 代码代替 `now64(3)`：

```Java
Calendar shanghaiCal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));

statement.setTimestamp(index, new Timestamp(System.currentTimeMillis()), shanghaiCal);
```

问题解决！