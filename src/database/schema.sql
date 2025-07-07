DROP DATABASE IF EXISTS infocimol08;
CREATE DATABASE infocimol08;
USE infocimol08;

-- Usuários genéricos
CREATE TABLE usuario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(100) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  tipo ENUM('candidato', 'empresa') NOT NULL,
  email_verificado BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id)
);

-- Empresas
CREATE TABLE empresa (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL UNIQUE,
  nome_empresa VARCHAR(100) NOT NULL,
  descricao TEXT NOT NULL,
  telefone VARCHAR(20),
  pais VARCHAR(100),
  estado VARCHAR(100),
  cidade VARCHAR(100),
  foto_perfil VARCHAR(255),
  PRIMARY KEY (id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
);

-- Candidatos
CREATE TABLE candidato (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL UNIQUE,
  nome VARCHAR(100),
  sobrenome VARCHAR(100),
  data_nascimento DATE,
  pais VARCHAR(100),
  estado VARCHAR(100),
  cidade VARCHAR(100),
  telefone VARCHAR(20),
  foto_perfil VARCHAR(255),
  PRIMARY KEY (id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
);

-- Áreas de interesse
CREATE TABLE area_interesse (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL UNIQUE,
  PRIMARY KEY (id)
);

-- Relacionamento candidato <-> áreas
CREATE TABLE candidato_area (
  candidato_id INT UNSIGNED NOT NULL,
  area_interesse_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (candidato_id, area_interesse_id),
  FOREIGN KEY (candidato_id) REFERENCES candidato(id) ON DELETE CASCADE,
  FOREIGN KEY (area_interesse_id) REFERENCES area_interesse(id) ON DELETE CASCADE
);

-- Inserções padrão para áreas
INSERT INTO area_interesse (nome) VALUES
('Administração'),
('Agropecuária / Agricultura'),
('Comunicação / Jornalismo'),
('Construção Civil'),
('Design / Criação'),
('Educação / Ensino'),
('Engenharia'),
('Eventos / Produção Cultural'),
('Finanças / Contabilidade'),
('Gastronomia / Alimentação'),
('Hotelaria / Turismo'),
('Jurídico'),
('Logística'),
('Marketing'),
('Mecânica / Manutenção'),
('Moda / Estilo'),
('Meio Ambiente'),
('Produção / Operacional'),
('Recursos Humanos (RH)'),
('Saúde'),
('Segurança / Vigilância'),
('Transporte / Motorista'),
('Tecnologia da Informação');
