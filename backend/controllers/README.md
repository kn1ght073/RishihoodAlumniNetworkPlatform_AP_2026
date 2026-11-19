# Controller organization

For this compact MVP, each file in `routes/` keeps one resource's HTTP validation and database calls together. This avoids a thin route-to-controller-to-service wrapper for every endpoint. Shared transaction, notification, and email work lives in `services/`; input and error helpers live in `utils/`.
