output "app_public_ip" {
  description = "Elastic IP of the QuantChat app server. Set this as the EC2_HOST GitHub Action secret."
  value       = aws_eip.app.public_ip
}

output "ssh_command" {
  description = "SSH command to connect to the app server."
  value       = "ssh ubuntu@${aws_eip.app.public_ip}"
}

output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.app.id
}
