variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type for the app server."
  type        = string
  default     = "t3.medium"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 30
}

variable "ssh_pubkey" {
  description = "SSH public key contents that should be installed on the EC2 instance. Paste the contents of your ~/.ssh/id_ed25519.pub (or RSA equivalent) here, or pass via TF_VAR_ssh_pubkey."
  type        = string
}

variable "ssh_cidr_blocks" {
  description = "List of CIDR blocks allowed to SSH to the app server. Default is open — restrict to your IP for security."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
