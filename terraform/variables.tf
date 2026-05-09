# Terraform Variables

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "quantchat_prod"
  sensitive   = true
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "quantchat_app"
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  description = "Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "quantchat"
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
