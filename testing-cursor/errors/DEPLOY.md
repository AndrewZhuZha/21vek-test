# Примеры привязки страниц ошибок (папка errors/)

Страницы лежат в `errors/` и используют относительные пути к ресурсам портала (`../css`, `../js`, `../index.html`).

## nginx

```nginx
error_page 400 /errors/400.html;
error_page 401 /errors/401.html;
error_page 403 /errors/403.html;
error_page 404 /errors/404.html;
error_page 500 /errors/500.html;
error_page 502 /errors/502.html;
error_page 503 /errors/503.html;
error_page 504 /errors/504.html;

location = /errors/400.html { internal; }
location = /errors/401.html { internal; }
location = /errors/403.html { internal; }
location = /errors/404.html { internal; }
location = /errors/500.html { internal; }
location = /errors/503.html { internal; }
location = /errors/502.html { internal; }
location = /errors/504.html { internal; }
```

Без `internal` страницы тоже откроются по прямой ссылке — это нормально для проверки.

## IIS (web.config, фрагмент)

```xml
<httpErrors errorMode="Custom" existingResponse="Replace">
  <remove statusCode="404" />
  <error statusCode="404" path="/errors/404.html" responseMode="ExecuteURL" />
  <remove statusCode="500" />
  <error statusCode="500" path="/errors/500.html" responseMode="ExecuteURL" />
  <!-- при необходимости добавьте 400, 401, 403, 502, 503, 504 -->
</httpErrors>
```

## Apache (.htaccess, фрагмент)

```apache
ErrorDocument 400 /errors/400.html
ErrorDocument 401 /errors/401.html
ErrorDocument 403 /errors/403.html
ErrorDocument 404 /errors/404.html
ErrorDocument 500 /errors/500.html
ErrorDocument 502 /errors/502.html
ErrorDocument 503 /errors/503.html
ErrorDocument 504 /errors/504.html
```

Пересборка HTML после правок шаблона: `node scripts/build-error-pages.mjs`
